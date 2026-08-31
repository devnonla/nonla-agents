import { eq } from "drizzle-orm";
import type { SSEStreamingApi } from "hono/streaming";
import { agentConversations, agentMessages, agents, getDb } from "../../../common/db/client.js";
import { wsHub } from "../../../common/ws/wsHub.js";
import { appendMessageContent, patchMessageMetadata, saveMessage, updateConversationStatus } from "../../conversations/conversations.service.js";
import { verifyPublicToken } from "../../public/public.service.js";
import type { AgentStreamEvent, MessageParam } from "./utils/agentRunner.js";
import { generateAgent, streamAgent } from "./utils/agentRunner.js";
import { loadHistory } from "./utils/loadHistory.js";
import { relayRunToSSE, runRegistry } from "./utils/run-registry.js";

export { loadHistory };

// ─── Stream chat (HTTP is a subscriber; run is background) ───────────────────

interface ChatStreamInput {
  agentId: string;
  conversationId: string;
  message: string;
  password?: string;
  token?: string;
}

/**
 * Validate access, save user message, start a background agent run, then relay
 * events into the caller's SSE stream.
 *
 * The AI run is independent of this HTTP connection: client disconnect /
 * F5 only unsubscribes the relay — the background task keeps going and late
 * clients can reconnect via GET /stream (with event replay).
 */
export async function streamChatSSE(body: ChatStreamInput, stream: SSEStreamingApi): Promise<void> {
  const { agentId, conversationId, message, password, token } = body;
  if (!conversationId || !agentId || !message) {
    await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "agentId, conversationId, and message are required" }) });
    return;
  }

  const db = getDb();
  const conv = db.select({ agentId: agentConversations.agentId, ownerId: agentConversations.ownerId, trigger: agentConversations.trigger }).from(agentConversations).where(eq(agentConversations.id, conversationId)).get();

  const msgAgentId = conv?.agentId ?? agentId;

  // ── Public access validation ──────────────────────────────────────────────
  if (conv?.trigger === "public") {
    const agent = db.select({ publicPassword: agents.publicPassword, isPublic: agents.isPublic }).from(agents).where(eq(agents.id, msgAgentId)).get();
    if (!agent?.isPublic) {
      await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "Agent is not public." }) });
      return;
    }
    if (agent.publicPassword && agent.publicPassword !== password) {
      const tokenValid = token ? await verifyPublicToken(msgAgentId, token) : false;
      if (!tokenValid) {
        await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "Nhập sai mật khẩu!" }) });
        return;
      }
    }
  }

  // ── Prepare ───────────────────────────────────────────────────────────────
  const history = loadHistory(conversationId);
  saveMessage({ agentId: msgAgentId, conversationId, role: "user", content: message, metadata: null });

  // Mark running + broadcast (clear finishedAt so other tabs don't treat this as stale)
  db.update(agentConversations).set({ status: "running", startedAt: new Date(), finishedAt: null, errorMessage: null }).where(eq(agentConversations.id, conversationId)).run();
  const updatedConv = db.select().from(agentConversations).where(eq(agentConversations.id, conversationId)).get();
  if (updatedConv) wsHub.broadcast("conversations:updated", updatedConv);

  const { abort, runId } = runRegistry.create(conversationId, agentId);

  // Background run — must not depend on this HTTP stream staying open
  void runChatBackground({
    agentId,
    conversationId,
    msgAgentId,
    message,
    history,
    ownerId: conv?.ownerId ?? "user",
    isGuest: conv?.trigger === "public",
    enableMemory: conv?.trigger !== "api",
    abortSignal: abort.signal,
    runId,
  });

  // This connection is just a subscriber; abort/disconnect only unsubscribes
  await relayRunToSSE(conversationId, stream);
}

// ─── Background agent run ─────────────────────────────────────────────────────

interface BackgroundRunInput {
  agentId: string;
  conversationId: string;
  msgAgentId: string;
  message: string;
  history: MessageParam[];
  ownerId: string;
  isGuest: boolean;
  enableMemory: boolean;
  abortSignal: AbortSignal;
  runId: symbol;
}

/** Kill hung runs that emit nothing for this long (tools/LLM true hangs). */
const RUN_STALL_MS = 5 * 60_000;
const RUN_STALL_CHECK_MS = 30_000;

async function runChatBackground(input: BackgroundRunInput): Promise<{ text: string; failed: boolean }> {
  const { agentId, conversationId, msgAgentId, message, history, ownerId, isGuest, enableMemory, abortSignal, runId } = input;
  const db = getDb();

  let fullText = "";
  let thinkingText = "";
  let thinkingStart = 0;
  let failed = false;
  let hasSavedSegments = false;
  let trailingAssistantSaved = false;
  let terminalSent = false;
  /** True while saving consecutive tool-calls that share one assistant (with tool_calls). */
  let inToolGroup = false;
  /** True when the assistant row for this tool group was saved empty (late preamble may still arrive). */
  let fillEmptyAssistant = false;
  const toolMsgIds = new Map<string, string>();
  let lastAssistantMsgId: string | null = null;

  const stillCurrent = () => runRegistry.isCurrent(conversationId, runId);

  const emit = (event: AgentStreamEvent) => {
    runRegistry.emit(conversationId, event, runId);
  };

  // Stall watchdog — if LangGraph/tools stop emitting, unblock SSE + free status
  const stallTimer = setInterval(() => {
    if (!stillCurrent()) return;
    const last = runRegistry.lastEventAt(conversationId);
    if (last != null && Date.now() - last >= RUN_STALL_MS) {
      failed = true;
      terminalSent = true;
      runRegistry.stall(conversationId, runId);
    }
  }, RUN_STALL_CHECK_MS);

  try {
    const messages = [...history, { role: "user" as const, content: message }];

    for await (const event of streamAgent(agentId, messages, {
      abortSignal,
      ownerId,
      isGuest,
      conversationId,
      enableMemory,
    })) {
      // Superseded by a newer run — stop mutating DB / registry
      if (!stillCurrent()) break;

      switch (event.type) {
        case "text-delta":
          if (thinkingText) {
            saveMessage({
              agentId: msgAgentId,
              conversationId,
              role: "thinking",
              content: thinkingText,
              metadata: { thinkingDuration: Math.round((Date.now() - thinkingStart) / 1000) },
            });
            thinkingText = "";
            thinkingStart = 0;
          }
          if (inToolGroup && lastAssistantMsgId && fillEmptyAssistant) {
            appendMessageContent(lastAssistantMsgId, event.text);
            break;
          }
          inToolGroup = false;
          lastAssistantMsgId = null;
          fillEmptyAssistant = false;
          fullText += event.text;
          break;

        case "thinking-delta":
          inToolGroup = false;
          lastAssistantMsgId = null;
          fillEmptyAssistant = false;
          if (!thinkingStart) {
            if (fullText.trim()) {
              saveMessage({ agentId: msgAgentId, conversationId, role: "assistant", content: fullText, metadata: null });
              hasSavedSegments = true;
              fullText = "";
            }
            thinkingStart = Date.now();
          }
          thinkingText += event.text;
          break;

        case "tool-call": {
          // Upsert: early tool_call_chunk may already have saved a row; complete args follow
          const existingToolMsgId = toolMsgIds.get(event.toolCallId);
          if (existingToolMsgId) {
            patchMessageMetadata(existingToolMsgId, {
              toolInput: event.input,
              toolLabel: event.toolLabel,
              toolName: event.toolName,
              ...(event.toolIcon != null ? { toolIcon: event.toolIcon } : {}),
            });
            break;
          }
          if (thinkingText) {
            saveMessage({
              agentId: msgAgentId,
              conversationId,
              role: "thinking",
              content: thinkingText,
              metadata: { thinkingDuration: Math.round((Date.now() - thinkingStart) / 1000) },
            });
            thinkingText = "";
            thinkingStart = 0;
          }
          // OpenAI requires tool messages to follow an assistant with tool_calls.
          // Always persist that assistant (text or empty) before the first tool in a group.
          if (fullText.trim()) {
            const saved = saveMessage({ agentId: msgAgentId, conversationId, role: "assistant", content: fullText, metadata: null });
            lastAssistantMsgId = saved.id;
            hasSavedSegments = true;
            fullText = "";
            inToolGroup = true;
            fillEmptyAssistant = false;
          } else if (!inToolGroup) {
            const saved = saveMessage({ agentId: msgAgentId, conversationId, role: "assistant", content: "", metadata: null });
            lastAssistantMsgId = saved.id;
            hasSavedSegments = true;
            inToolGroup = true;
            fillEmptyAssistant = true;
          }
          const toolMsg = saveMessage({
            agentId: msgAgentId,
            conversationId,
            role: "tool",
            content: event.toolName,
            metadata: {
              toolName: event.toolName,
              toolLabel: event.toolLabel,
              toolInput: event.input,
              toolCallId: event.toolCallId,
              ...(event.toolIcon != null ? { toolIcon: event.toolIcon } : {}),
            },
          });
          if (toolMsg.id) toolMsgIds.set(event.toolCallId, toolMsg.id);
          break;
        }

        case "tool-result": {
          inToolGroup = false;
          lastAssistantMsgId = null;
          fillEmptyAssistant = false;
          const toolMsgId = toolMsgIds.get(event.toolCallId);
          if (toolMsgId) {
            const resultStr = typeof event.result === "string" ? event.result : JSON.stringify(event.result);
            const patchData: Record<string, unknown> = {
              toolOutput: resultStr,
              result: event.result,
            };
            const { isCallAgentToolName, parseCallAgentToolTargetId } = await import("./llm-tools/call-agent.tool.js");
            if (isCallAgentToolName(event.toolName)) {
              try {
                const parsed = typeof event.result === "string" ? JSON.parse(event.result) : event.result;
                const agentId = parsed?.agent_id ?? parseCallAgentToolTargetId(event.toolName);
                if (agentId) {
                  const existingInput = ((): Record<string, unknown> => {
                    const row = getDb().select().from(agentMessages).where(eq(agentMessages.id, toolMsgId)).get();
                    const meta = row?.metadata as Record<string, unknown> | null;
                    return (meta?.toolInput as Record<string, unknown>) ?? {};
                  })();
                  patchData.toolInput = { ...existingInput, agent_id: agentId };
                  const { getCallAgentLabel } = await import("./utils/resolveTools.js");
                  patchData.toolLabel = getCallAgentLabel({ agent_id: agentId });
                }
              } catch {
                /* ignore parse errors */
              }
            }
            patchMessageMetadata(toolMsgId, patchData);
          }
          break;
        }

        case "done":
          if (!fullText && !hasSavedSegments) fullText = event.text || "";
          // Persist trailing thinking/text BEFORE clients see done (avoids refetch race).
          // Thinking stays thinking — never promote into assistant content.
          if (thinkingText) {
            saveMessage({
              agentId: msgAgentId,
              conversationId,
              role: "thinking",
              content: thinkingText,
              metadata: { thinkingDuration: Math.round((Date.now() - thinkingStart) / 1000) },
            });
            thinkingText = "";
            thinkingStart = 0;
          }
          if (fullText.trim()) {
            saveMessage({ agentId: msgAgentId, conversationId, role: "assistant", content: fullText, metadata: null });
            trailingAssistantSaved = true;
            hasSavedSegments = true;
          }
          break;

        case "error":
          failed = true;
          break;
      }

      emit(event);

      if (event.type === "done" || event.type === "error") {
        terminalSent = true;
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = abortSignal.aborted || msg.includes("AbortError") || msg === "AbortError" || (err instanceof Error && err.name === "AbortError");
    failed = true;
    // Only emit cancel/error if we still own the run (superseded / cancel already terminalized)
    if (stillCurrent()) {
      const errorMsg = isAbort ? "cancelled" : msg;
      emit({ type: "error", error: errorMsg });
      terminalSent = true;
    } else if (abortSignal.aborted) {
      // cancel() already finished the run + notified subscribers; still mark for DB cleanup below
      failed = true;
      terminalSent = true;
    }
  } finally {
    clearInterval(stallTimer);

    const runStillOurs = () => {
      // isCurrent requires !finished — after cancel/stall the run is finished but may still be ours in grace.
      // Prefer finishing DB when this runId still owns the registry entry OR entry already dropped after grace.
      if (runRegistry.isCurrent(conversationId, runId)) return true;
      // Finished by cancel()/stall() while we were blocked in a tool — still need DB status
      if (abortSignal.aborted && !runRegistry.isActive(conversationId)) return true;
      return false;
    };

    // Superseded by a newer create() — do not touch status / messages / registry
    if (runStillOurs()) {
      // If cancel already marked finished mid-tool, treat as failed/cancelled
      if (abortSignal.aborted) failed = true;

      if (failed) {
        for (const [, toolMsgId] of toolMsgIds.entries()) {
          const row = db.select().from(agentMessages).where(eq(agentMessages.id, toolMsgId)).get();
          const meta = row?.metadata as Record<string, unknown> | null;
          if (row && !meta?.toolOutput) {
            patchMessageMetadata(toolMsgId, {
              toolOutput: JSON.stringify({ error: "Tool execution failed or was interrupted" }),
              toolError: true,
            });
          }
        }
      }

      // Leftover thinking/text after stream end (may already be flushed on `done`).
      // Thinking stays thinking — never promote into assistant content.
      if (thinkingText) {
        saveMessage({
          agentId: msgAgentId,
          conversationId,
          role: "thinking",
          content: thinkingText,
          metadata: { thinkingDuration: Math.round((Date.now() - thinkingStart) / 1000) },
        });
        thinkingText = "";
      }
      if (fullText.trim() && !trailingAssistantSaved) {
        saveMessage({ agentId: msgAgentId, conversationId, role: "assistant", content: fullText, metadata: null });
      }

      updateConversationStatus(conversationId, { status: failed ? "failed" : "done", finishedAt: new Date() });

      if (stillCurrent()) {
        if (!terminalSent) {
          if (failed) {
            emit({ type: "error", error: "Stream ended unexpectedly" });
          } else {
            emit({ type: "done", text: fullText });
          }
        }
        runRegistry.finish(conversationId, runId);
      }
    }
  }

  return { text: fullText, failed };
}

/**
 * Run an agent inside an existing conversation using the same streaming registry as chat.
 * Jobs/cron can await the final text; Stop in the UI works via runRegistry + GET /stream resume.
 * Caller must already have saved the user message.
 */
export async function runAgentConversation(opts: {
  agentId: string;
  conversationId: string;
  message: string;
  ownerId: string;
  isGuest?: boolean;
}): Promise<{ text: string; failed: boolean; cancelled: boolean }> {
  const { agentId, conversationId, message, ownerId, isGuest = false } = opts;
  const history = loadHistory(conversationId);
  // runChatBackground appends the user message — drop the trailing duplicate if already saved
  const hist = [...history];
  if (hist.length > 0) {
    const last = hist[hist.length - 1];
    if (last.role === "user" && last.content === message) hist.pop();
  }

  const db = getDb();
  db.update(agentConversations).set({ status: "running", startedAt: new Date(), finishedAt: null, errorMessage: null }).where(eq(agentConversations.id, conversationId)).run();
  const updatedConv = db.select().from(agentConversations).where(eq(agentConversations.id, conversationId)).get();
  if (updatedConv) wsHub.broadcast("conversations:updated", updatedConv);

  const { abort, runId } = runRegistry.create(conversationId, agentId);
  const result = await runChatBackground({
    agentId,
    conversationId,
    msgAgentId: agentId,
    message,
    history: hist,
    ownerId,
    isGuest,
    enableMemory: true,
    abortSignal: abort.signal,
    runId,
  });

  return {
    text: result.text,
    failed: result.failed,
    cancelled: abort.signal.aborted,
  };
}

/**
 * Stop a running stream. Unblocks SSE immediately and marks conversation failed
 * so the UI does not stay on spinner while a hung tool ignores abort.
 */
export function stopStream(conversationId: string) {
  const cancelled = runRegistry.cancel(conversationId);
  if (cancelled) {
    updateConversationStatus(conversationId, {
      status: "failed",
      finishedAt: new Date(),
      errorMessage: "cancelled",
    });
    return true;
  }
  // Orphan running row (e.g. legacy non-registry job call) — clear spinner in UI
  const conv = getDb().select().from(agentConversations).where(eq(agentConversations.id, conversationId)).get();
  if (conv?.status === "running") {
    updateConversationStatus(conversationId, {
      status: "failed",
      finishedAt: new Date(),
      errorMessage: "cancelled",
    });
    return true;
  }
  return false;
}

// ─── Generate (non-streaming) ─────────────────────────────────────────────────

export async function generateResponse(agentId: string, message: string, conversationId?: string, maxSteps = 40, opts: { ownerId?: string } = {}) {
  const history = conversationId ? loadHistory(conversationId) : [];
  const messages = [...history, { role: "user" as const, content: message }];

  let ownerId = opts.ownerId ?? "user";
  if (conversationId) {
    const conv = getDb().select({ ownerId: agentConversations.ownerId }).from(agentConversations).where(eq(agentConversations.id, conversationId)).get();
    if (conv?.ownerId) ownerId = conv.ownerId;
  }

  return generateAgent(agentId, messages, {
    maxSteps,
    ownerId,
    conversationId: conversationId ?? null,
  });
}
