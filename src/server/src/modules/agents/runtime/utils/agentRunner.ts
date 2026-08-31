/**
 * agentRunner.ts (server-side)
 *
 * Core AI engine — runs entirely on server.
 * - generateAgent(): non-streaming, returns text (for call_agent, task runner)
 * - streamAgent(): streaming via AsyncIterable of AgentStreamEvent
 *
 * LangGraph JS version — uses createAgent from langchain
 *
 * Tool resolution:
 *   1. agent_tool_assignments (builtin:*, mcp:*, or custom tool UUID)
 *   2. agent.callableAgentIds → system prompt + one call_agent__* tool each
 *   3. Always-on: memory
 */

import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { eq } from "drizzle-orm";
import { createAgent } from "langchain";
import { extractAiMessageText, unstreamedTextRemainder } from "../../../../common/ai/ai-message-text.js";
import { getChatModel } from "../../../../common/ai/getChatModel.js";
import { agents, getDb } from "../../../../common/db/client.js";
import { type AssignmentWithTool, listAssignments } from "../../agents.service.js";
import { isCallAgentToolName, parseCallAgentToolTargetId } from "../llm-tools/call-agent.tool.js";
import { resolveSystemPrompt } from "./buildSystemPrompt.js";
import { appendToolsCatalog, buildLazyToolsBundle } from "./lazy-tools.middleware.js";
import { getToolIcon, getToolLabel, resolveAgentTools } from "./resolveTools.js";

const MODEL_NODE = "model_request";
const NOSTREAM_TAG = "langsmith:nostream";

function isParentModelStreamChunk(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) return true;
  const node = metadata.langgraph_node;
  if (typeof node === "string" && node !== MODEL_NODE) return false;
  const ns = (metadata.langgraph_checkpoint_ns ?? metadata.checkpoint_ns) as string | undefined;
  if (typeof ns === "string" && ns.includes("|")) return false;
  return true;
}

// ─── Event types for streaming ────────────────────────────────────────────────

export type AgentStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "thinking-delta"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; toolLabel: string; toolIcon?: string | null; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: unknown }
  | { type: "done"; text: string }
  | { type: "error"; error: string };

/** Best-effort JSON parse of streamed tool-call arg fragments (often empty/partial). */
function tryParseToolArgs(argsStr: string): unknown {
  if (!argsStr) return {};
  try {
    return JSON.parse(argsStr);
  } catch {
    return {};
  }
}

export type MessageParam = { role: "user"; content: string } | { role: "assistant"; content: string } | { role: "assistant"; content: string; toolCalls: Array<{ id: string; name: string; args: unknown }> } | { role: "tool-result"; toolCallId: string; toolName: string; result: string };

export type AgentStepSummary = {
  toolCalls: Array<{ toolName: string; label: string; args: unknown }>;
  toolResults: Array<{ toolName: string; result: unknown }>;
  text: string;
};

export type AgentResult = {
  text: string;
  steps: AgentStepSummary[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build enabled tool_id list from junction table assignments */
function buildEnabledToolIds(assignments: AssignmentWithTool[]): string[] {
  return assignments.map((a) => a.toolId).filter((id) => id !== "builtin:call_agent");
}

function loadCallableAgents(callableAgentIds: string[]): { id: string; name: string; description: string | null }[] {
  if (callableAgentIds.length === 0) return [];
  const db = getDb();
  const all = db.select({ id: agents.id, name: agents.name, description: agents.description }).from(agents).all();
  return all.filter((a) => callableAgentIds.includes(a.id));
}

function enrichToolCallInput(toolName: string, args: unknown): unknown {
  if (!isCallAgentToolName(toolName)) return args;
  const agentId = parseCallAgentToolTargetId(toolName);
  if (!agentId) return args;
  const base = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  return { ...base, agent_id: agentId };
}

/** Convert MessageParam[] to BaseMessage[] for LangGraph */
function toBaseMessages(messages: MessageParam[]): BaseMessage[] {
  return messages.map((m) => {
    if (m.role === "user") return new HumanMessage(m.content);
    if (m.role === "tool-result") {
      return new ToolMessage({
        content: m.result,
        tool_call_id: m.toolCallId,
        name: m.toolName,
      });
    }
    // assistant (with or without tool_calls)
    if ("toolCalls" in m && m.toolCalls.length > 0) {
      return new AIMessage({
        content: m.content,
        tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args as Record<string, unknown> })),
      });
    }
    return new AIMessage(m.content);
  });
}

/** Parse final messages from the agent's output state into AgentResult */
function parseAgentResult(resultMessages: BaseMessage[]): AgentResult {
  let fullText = "";
  const steps: AgentStepSummary[] = [];
  let currentStep: AgentStepSummary | null = null;

  for (const msg of resultMessages) {
    const type = msg._getType();

    if (type === "ai") {
      const aiMsg = msg as AIMessage;

      // Finalize previous step if it had tool calls
      if (currentStep && currentStep.toolCalls.length > 0) {
        steps.push(currentStep);
      }

      // Check for tool calls
      if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
        currentStep = {
          text: typeof aiMsg.content === "string" ? aiMsg.content : "",
          toolCalls: aiMsg.tool_calls.map((tc) => ({
            toolName: tc.name,
            label: getToolLabel(tc.name),
            args: tc.args,
          })),
          toolResults: [],
        };
      } else {
        currentStep = null;
        // This is the final text response
        if (typeof aiMsg.content === "string" && aiMsg.content) {
          fullText = aiMsg.content;
        }
      }
    } else if (type === "tool") {
      // Tool result — attach to current step
      if (currentStep) {
        const toolMsg = msg as any;
        currentStep.toolResults.push({
          toolName: toolMsg.name ?? "unknown",
          result:
            typeof toolMsg.content === "string"
              ? (() => {
                  try {
                    return JSON.parse(toolMsg.content);
                  } catch {
                    return toolMsg.content;
                  }
                })()
              : toolMsg.content,
        });
      }
    }
  }

  // Finalize last step if it had tool calls
  if (currentStep && currentStep.toolCalls.length > 0) {
    steps.push(currentStep);
  }

  // Fallback: try to find any text from AI messages if fullText is empty
  if (!fullText) {
    fullText =
      resultMessages
        .filter((m) => m._getType() === "ai")
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .filter(Boolean)
        .pop() ?? "";
  }

  return { text: fullText, steps };
}

// ─── generateAgent ────────────────────────────────────────────────────────────

/**
 * Run agent non-streaming (for call_agent tool, task runner fallback).
 * @returns { text, steps } — full response text and per-step summaries.
 */
export async function generateAgent(
  agentId: string,
  messages: MessageParam[],
  options: {
    maxSteps?: number;
    abortSignal?: AbortSignal;
    allowCallAgent?: boolean;
    ownerId?: string;
    isGuest?: boolean;
    conversationId?: string | null;
    enableMemory?: boolean;
  } = {},
): Promise<AgentResult> {
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) throw new Error(`Agent not found: ${agentId}`);
  if (!agent.aiProvider || !agent.aiModel) {
    throw new Error(`Agent "${agent.name}" has no AI provider configured`);
  }

  // Get tool assignments from junction table
  const assignments = listAssignments(agentId);
  const enabledToolIds = buildEnabledToolIds(assignments);

  const ownerId = options.ownerId ?? "user";
  const isGuest = options.isGuest ?? false;
  const allowCallAgent = options.allowCallAgent !== false;

  // Callable agents from agent's callableAgentIds column
  const callableAgentIds: string[] = (agent.callableAgentIds as string[]) ?? [];
  const callableAgents = allowCallAgent ? loadCallableAgents(callableAgentIds) : [];

  const [model, baseSystemPrompt, tools] = await Promise.all([
    getChatModel(agent.aiProvider, agent.aiModel),
    Promise.resolve(resolveSystemPrompt(agentId, callableAgents.length > 0 ? callableAgentIds : undefined)),
    Promise.resolve(
      resolveAgentTools(agentId, enabledToolIds, ownerId, isGuest, {
        callableAgents,
        allowCallAgent,
        abortSignal: options.abortSignal,
        conversationId: options.conversationId ?? null,
        enableMemory: options.enableMemory,
      }),
    ),
  ]);

  const lazy = buildLazyToolsBundle(tools, { messages });
  const systemPrompt = appendToolsCatalog(baseSystemPrompt, lazy.catalogPromptSection);

  const reactAgent = createAgent({
    model,
    tools: lazy.allToolsForAgent,
    systemPrompt,
    middleware: [lazy.middleware],
  });

  const input = {
    messages: toBaseMessages(messages),
  };

  const maxSteps = options.maxSteps ?? 40;
  const result = await reactAgent.invoke(input, {
    recursionLimit: maxSteps * 2 + 1,
    signal: options.abortSignal,
    tags: [NOSTREAM_TAG],
  });

  // Parse result.messages (BaseMessage[]) → AgentResult
  // Skip the original input messages (system prompt is handled internally by createAgent)
  const originalCount = messages.length;
  const newMessages = result.messages.slice(originalCount);
  return parseAgentResult(newMessages);
}

// ─── streamAgent ──────────────────────────────────────────────────────────────

/**
 * Run agent with streaming — yields AgentStreamEvent objects.
 * Used by the /api/agents/:id/chat SSE endpoint.
 */
export async function* streamAgent(
  agentId: string,
  messages: MessageParam[],
  options: {
    maxSteps?: number;
    abortSignal?: AbortSignal;
    ownerId?: string;
    isGuest?: boolean;
    conversationId?: string | null;
    enableMemory?: boolean;
  } = {},
): AsyncGenerator<AgentStreamEvent> {
  const db = getDb();
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();

  if (!agent) {
    yield { type: "error", error: `Agent not found: ${agentId}` };
    return;
  }

  if (!agent.aiProvider || !agent.aiModel) {
    yield {
      type: "error",
      error: `Agent "${agent.name}" has no AI provider configured`,
    };
    return;
  }

  // Get tool assignments from junction table
  const assignments = listAssignments(agentId);
  const enabledToolIds = buildEnabledToolIds(assignments);

  const ownerId = options.ownerId ?? "user";
  const isGuest = options.isGuest ?? false;

  try {
    // Callable agents from agent's callableAgentIds column
    const callableAgentIds: string[] = (agent.callableAgentIds as string[]) ?? [];
    const callableAgents = loadCallableAgents(callableAgentIds);

    const [model, baseSystemPrompt, tools] = await Promise.all([
      getChatModel(agent.aiProvider, agent.aiModel),
      Promise.resolve(resolveSystemPrompt(agentId, callableAgents.length > 0 ? callableAgentIds : undefined)),
      Promise.resolve(
        resolveAgentTools(agentId, enabledToolIds, ownerId, isGuest, {
          callableAgents,
          allowCallAgent: true,
          abortSignal: options.abortSignal,
          conversationId: options.conversationId ?? null,
          enableMemory: options.enableMemory,
        }),
      ),
    ]);

    const lazy = buildLazyToolsBundle(tools, { messages });
    const systemPrompt = appendToolsCatalog(baseSystemPrompt, lazy.catalogPromptSection);

    const reactAgent = createAgent({
      model,
      tools: lazy.allToolsForAgent,
      systemPrompt,
      middleware: [lazy.middleware],
    });

    const input = {
      messages: toBaseMessages(messages),
    };

    const maxSteps = options.maxSteps ?? 40;
    const stream = await reactAgent.stream(input, {
      recursionLimit: maxSteps * 2 + 1,
      signal: options.abortSignal,
      streamMode: ["messages", "updates"] as any,
    });

    let fullText = "";
    let streamedThisMessage = "";
    const emittedToolCalls = new Set<string>();
    const pendingToolCalls = new Map<string, { name: string; argsStr: string }>();

    const yieldTextDelta = function* (text: string) {
      if (!text) return;
      fullText += text;
      streamedThisMessage += text;
      yield { type: "text-delta" as const, text };
    };

    const flushUnstreamedFromAiMessage = function* (msg: { content?: unknown }) {
      const rest = unstreamedTextRemainder(extractAiMessageText(msg?.content), streamedThisMessage);
      if (rest) yield* yieldTextDelta(rest);
    };

    try {
      for await (const chunk of stream) {
        const [mode, data] = chunk as unknown as [string, any];

        if (mode === "messages") {
          const [msgChunk, metadata] = data as [any, Record<string, unknown> | undefined];
          if (!isParentModelStreamChunk(metadata)) continue;

          const msgType = msgChunk?._getType?.() ?? msgChunk?.type;

          if (msgType === "ai" || msgType === "AIMessageChunk") {
            const content = msgChunk?.content;

            // ── Extract text + thinking from content ──
            if (typeof content === "string" && content) {
              yield* yieldTextDelta(content);
            } else if (Array.isArray(content)) {
              for (const block of content) {
                // Claude: {type:"thinking", thinking:"..."}
                if (block.type === "thinking" && block.thinking) {
                  yield { type: "thinking-delta", text: block.thinking };
                }
                // Reasoning: LangChain standard `{type:"reasoning", reasoning}` /
                // OpenAI Responses `{summary:[...]}` / flat `{text}`
                else if (block.type === "reasoning") {
                  if (typeof block.reasoning === "string" && block.reasoning) {
                    yield { type: "thinking-delta", text: block.reasoning };
                  } else {
                    const summaries = block.summary ?? block.content ?? [];
                    if (Array.isArray(summaries)) {
                      for (const s of summaries) {
                        if (s.text) {
                          yield { type: "thinking-delta", text: s.text };
                        } else if (typeof s.reasoning === "string" && s.reasoning) {
                          yield { type: "thinking-delta", text: s.reasoning };
                        }
                      }
                    } else if (typeof block.text === "string" && block.text) {
                      yield { type: "thinking-delta", text: block.text };
                    } else if (typeof summaries === "string" && summaries) {
                      yield { type: "thinking-delta", text: summaries };
                    }
                  }
                }
                // Standard text block
                else if (block.type === "text" && block.text) {
                  yield* yieldTextDelta(block.text);
                } else if (block.type === "output_text" && block.text) {
                  yield* yieldTextDelta(block.text);
                }
              }
            }

            // Fallback: reasoning in additional_kwargs (older LangChain or non-Responses API)
            const reasoning = msgChunk?.additional_kwargs?.reasoning_content ?? msgChunk?.additional_kwargs?.reasoning;
            if (typeof reasoning === "string" && reasoning) {
              yield { type: "thinking-delta", text: reasoning };
            }

            // Tool call chunks — emit early on first id+name so UI can show Running… while
            // the model finishes args and the tools node executes. updates mode later
            // re-yields the same toolCallId with full args (client/service upsert).
            if (msgChunk?.tool_call_chunks) {
              for (const tc of msgChunk.tool_call_chunks) {
                if (tc.id) {
                  const pending = pendingToolCalls.get(tc.id);
                  if (pending) {
                    // Append incremental args fragment
                    if (tc.args) pending.argsStr += tc.args;
                  } else if (tc.name) {
                    // First chunk for this tool call — register + notify UI immediately
                    pendingToolCalls.set(tc.id, { name: tc.name, argsStr: tc.args ?? "" });
                    if (!emittedToolCalls.has(tc.id)) {
                      emittedToolCalls.add(tc.id);
                      const earlyArgs = tryParseToolArgs(tc.args ?? "");
                      yield {
                        type: "tool-call",
                        toolCallId: tc.id,
                        toolName: tc.name,
                        toolLabel: getToolLabel(tc.name),
                        toolIcon: getToolIcon(tc.name),
                        input: enrichToolCallInput(tc.name, earlyArgs),
                      };
                    }
                  }
                }
              }
            }
          }
        } else if (mode === "updates") {
          // updates mode: { nodeName: { messages: [...] } }
          // Extract both tool-call and tool-result from updates mode to guarantee ordering
          // (tool-call from agent node always arrives before tool-result from tools node).
          for (const [, state] of Object.entries(data as Record<string, any>)) {
            if (!state?.messages) continue;

            for (const msg of state.messages) {
              const msgType = msg?._getType?.() ?? msg?.type;
              const isAi = msgType === "ai" || msgType === "AIMessage" || msgType === "AIMessageChunk";
              if (isAi || (Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0)) {
                yield* flushUnstreamedFromAiMessage(msg);
              }

              if (msg?.tool_calls && Array.isArray(msg.tool_calls)) {
                streamedThisMessage = "";
                for (const tc of msg.tool_calls) {
                  const tcId = tc.id ?? `${tc.name}-${Date.now()}`;
                  emittedToolCalls.add(tcId);
                  // Remove from pending since we have the complete version
                  pendingToolCalls.delete(tcId);
                  // Always yield: first paint or arg-complete upsert (same toolCallId)
                  yield {
                    type: "tool-call",
                    toolCallId: tcId,
                    toolName: tc.name,
                    toolLabel: getToolLabel(tc.name),
                    toolIcon: getToolIcon(tc.name),
                    input: enrichToolCallInput(tc.name, tc.args),
                  };
                }
              }

              if (msgType === "tool" || msgType === "ToolMessage") {
                const toolCallId: string = msg.tool_call_id ?? "";
                const toolName = msg.name ?? "unknown";
                const rawContent = msg.content;
                const result =
                  typeof rawContent === "string"
                    ? (() => {
                        try {
                          return JSON.parse(rawContent);
                        } catch {
                          return rawContent;
                        }
                      })()
                    : rawContent;
                yield { type: "tool-result", toolCallId, toolName, result };
              }
            }
          }
        }
      }

      // Flush any pending tool calls that weren't emitted via updates mode (edge case)
      for (const [tcId, pending] of pendingToolCalls) {
        if (!emittedToolCalls.has(tcId)) {
          emittedToolCalls.add(tcId);
          const parsedArgs = pending.argsStr
            ? (() => {
                try {
                  return JSON.parse(pending.argsStr);
                } catch {
                  return pending.argsStr;
                }
              })()
            : {};
          yield {
            type: "tool-call",
            toolCallId: tcId,
            toolName: pending.name,
            toolLabel: getToolLabel(pending.name),
            toolIcon: getToolIcon(pending.name),
            input: enrichToolCallInput(pending.name, parsedArgs),
          };
        }
      }

      yield { type: "done", text: fullText };
    } catch (streamErr) {
      const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
      const isAbort = msg.includes("AbortError") || msg === "AbortError" || (streamErr instanceof Error && streamErr.name === "AbortError");
      if (isAbort) {
        yield { type: "error", error: "cancelled" };
        return;
      }
      yield { type: "error", error: msg };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = msg.includes("AbortError") || msg === "AbortError" || (err instanceof Error && err.name === "AbortError");
    if (isAbort) {
      yield { type: "error", error: "cancelled" };
      return;
    }
    yield { type: "error", error: msg };
  }
}
