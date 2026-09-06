/**
 * stream-agent-sse.ts — Shared SSE streaming helper for LangChain agents.
 *
 * Encapsulates the common streaming loop used by both prompt-agent and
 * coding-agent (and any future agent services). Handles:
 *   - AI text token streaming   (messages mode)
 *   - tool-call / tool-result   (messages + updates; unresolved calls flushed on end)
 *   - done / error events
 *   - SSE heartbeat pings so long tool/model waits do not hit idleTimeout
 */

import type { BaseMessage } from "@langchain/core/messages";
import type { SSEStreamingApi } from "hono/streaming";
import { extractAiMessageText, unstreamedTextRemainder } from "./ai-message-text.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreamAgentSSEOptions {
  /** A compiled LangChain agent (returned by `createAgent`). */
  agent: { stream: (input: any, config?: any) => Promise<AsyncIterable<any>> };
  /** The full list of messages (system + user/assistant history). */
  messages: BaseMessage[];
  /** Maximum ReAct loop iterations (default 12). */
  maxSteps?: number;
  /** Hono SSE stream to write events to. */
  stream: SSEStreamingApi;
  /** Optional AbortSignal — when fired, the agent run is cancelled. */
  abortSignal?: AbortSignal;
}

const SSE_HEARTBEAT_MS = 15_000;

function tryParseToolArgs(argsStr: string): unknown {
  if (!argsStr) return {};
  try {
    return JSON.parse(argsStr);
  } catch {
    return {};
  }
}

function parseToolResultContent(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Agent `updates` stream values vary: `{ messages }`, a message array, or a single message. */
export function messagesFromUpdateValue(state: unknown): any[] {
  if (!state) return [];
  if (Array.isArray(state)) return state;
  if (typeof state !== "object") return [];
  const rec = state as Record<string, unknown>;
  if (rec.messages != null) {
    return Array.isArray(rec.messages) ? rec.messages : [rec.messages];
  }
  if ("_getType" in rec || rec.type != null || rec.tool_calls != null || rec.tool_call_id != null) {
    return [rec];
  }
  return [];
}

function isToolMessage(msg: any): boolean {
  const msgType = msg?._getType?.() ?? msg?.type;
  return msgType === "tool" || msgType === "ToolMessage";
}

function isAiMessage(msg: any): boolean {
  const msgType = msg?._getType?.() ?? msg?.type;
  return msgType === "ai" || msgType === "AIMessage" || msgType === "AIMessageChunk";
}

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Run a LangChain agent and stream its output as SSE events.
 *
 * SSE event types emitted (same protocol as agent chat):
 *   - `{ type: "text-delta",     text }          ` — AI text token
 *   - `{ type: "thinking-delta", text }          ` — AI thinking / reasoning token
 *   - `{ type: "tool-call",      toolCallId, toolName, input }`
 *   - `{ type: "tool-result",    toolCallId, toolName, result }`
 *   - `{ type: "done" }`
 *   - `{ type: "error",          error }`
 *   - `{ type: "ping" }` — keep-alive (clients ignore)
 */

export async function streamAgentSSE({ agent, messages, maxSteps = 100, stream, abortSignal }: StreamAgentSSEOptions): Promise<void> {
  let heartbeat: ReturnType<typeof setInterval> | null = setInterval(() => {
    stream.writeSSE({ data: JSON.stringify({ type: "ping" }) }).catch(() => {
      /* client gone */
    });
  }, SSE_HEARTBEAT_MS);

  const stopHeartbeat = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  let flushOpenTools = async (_error: string) => {};

  try {
    if (abortSignal?.aborted) {
      await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "cancelled" }) });
      return;
    }

    const agentStream = await agent.stream(
      { messages },
      {
        recursionLimit: maxSteps * 2 + 1,
        streamMode: ["messages", "updates"] as any,
        signal: abortSignal,
      },
    );

    const emittedToolNames = new Map<string, string>();
    const resolvedToolCallIds = new Set<string>();
    const pendingToolCalls = new Map<string, { name: string; argsStr: string }>();
    let streamedThisMessage = "";

    const writeTextDelta = async (text: string) => {
      if (!text) return;
      streamedThisMessage += text;
      await stream.writeSSE({
        data: JSON.stringify({ type: "text-delta", text }),
      });
    };

    const flushUnstreamedFromAiMessage = async (msg: { content?: unknown }) => {
      const rest = unstreamedTextRemainder(extractAiMessageText(msg?.content), streamedThisMessage);
      if (rest) await writeTextDelta(rest);
    };

    const emitToolCall = async (toolCallId: string, toolName: string, input: unknown) => {
      emittedToolNames.set(toolCallId, toolName);
      await stream.writeSSE({
        data: JSON.stringify({
          type: "tool-call",
          toolCallId,
          toolName,
          input,
        }),
      });
    };

    const emitToolResult = async (toolCallId: string, toolName: string, result: unknown) => {
      const id = toolCallId || "";
      if (id && resolvedToolCallIds.has(id)) return;
      if (id) resolvedToolCallIds.add(id);
      const name = toolName && toolName !== "unknown" ? toolName : (emittedToolNames.get(id) ?? toolName ?? "unknown");
      await stream.writeSSE({
        data: JSON.stringify({
          type: "tool-result",
          toolCallId: id,
          toolName: name,
          result,
        }),
      });
    };

    flushOpenTools = async (error: string) => {
      for (const [id, name] of emittedToolNames) {
        if (!resolvedToolCallIds.has(id)) {
          await emitToolResult(id, name, { success: false, error });
        }
      }
    };

    const resolveToolCallId = (tc: { id?: string; name?: string }): string => {
      if (tc.id) return tc.id;
      for (const [id, pending] of pendingToolCalls) {
        if (pending.name === tc.name) return id;
      }
      for (const [id, name] of emittedToolNames) {
        if (name === tc.name && !resolvedToolCallIds.has(id)) return id;
      }
      return `${tc.name ?? "tool"}-${Date.now()}`;
    };

    const handleToolResultMessage = async (msg: any) => {
      if (!isToolMessage(msg)) return false;
      await emitToolResult(msg.tool_call_id ?? "", msg.name ?? "unknown", parseToolResultContent(msg.content));
      return true;
    };

    const handleAiToolCalls = async (msg: any) => {
      if (!msg?.tool_calls || !Array.isArray(msg.tool_calls)) return;
      streamedThisMessage = "";
      for (const tc of msg.tool_calls) {
        const tcId = resolveToolCallId(tc);
        pendingToolCalls.delete(tcId);
        await emitToolCall(tcId, tc.name, tc.args);
      }
    };

    const handleAiStreamChunk = async (msgChunk: any) => {
      const content = msgChunk?.content;

      if (typeof content === "string" && content) {
        await writeTextDelta(content);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "thinking" && block.thinking) {
            await stream.writeSSE({
              data: JSON.stringify({ type: "thinking-delta", text: block.thinking }),
            });
          } else if (block.type === "reasoning") {
            const reasoningBits: string[] = [];
            if (typeof block.reasoning === "string" && block.reasoning) {
              reasoningBits.push(block.reasoning);
            } else {
              const summaries = block.summary ?? block.content ?? [];
              if (Array.isArray(summaries)) {
                for (const s of summaries) {
                  if (s.text) reasoningBits.push(s.text);
                  else if (typeof s.reasoning === "string" && s.reasoning) reasoningBits.push(s.reasoning);
                }
              } else if (typeof block.text === "string" && block.text) {
                reasoningBits.push(block.text);
              } else if (typeof summaries === "string" && summaries) {
                reasoningBits.push(summaries);
              }
            }
            for (const text of reasoningBits) {
              await stream.writeSSE({
                data: JSON.stringify({ type: "thinking-delta", text }),
              });
            }
          } else if (block.type === "text" && block.text) {
            await writeTextDelta(block.text);
          } else if (block.type === "output_text" && block.text) {
            await writeTextDelta(block.text);
          }
        }
      }

      const reasoning = msgChunk?.additional_kwargs?.reasoning_content ?? msgChunk?.additional_kwargs?.reasoning;
      if (typeof reasoning === "string" && reasoning) {
        await stream.writeSSE({
          data: JSON.stringify({ type: "thinking-delta", text: reasoning }),
        });
      }

      // Early tool-call: first chunk with id+name → paint Running… immediately
      if (msgChunk?.tool_call_chunks) {
        for (const tc of msgChunk.tool_call_chunks) {
          if (!tc.id) continue;
          const pending = pendingToolCalls.get(tc.id);
          if (pending) {
            if (tc.args) pending.argsStr += tc.args;
            continue;
          }
          if (!tc.name) continue;
          pendingToolCalls.set(tc.id, { name: tc.name, argsStr: tc.args ?? "" });
          if (!emittedToolNames.has(tc.id)) {
            await emitToolCall(tc.id, tc.name, tryParseToolArgs(tc.args ?? ""));
          }
        }
      }
    };

    for await (const chunk of agentStream) {
      if (abortSignal?.aborted) {
        await flushOpenTools("cancelled");
        await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "cancelled" }) });
        return;
      }
      const [mode, data] = chunk as unknown as [string, any];

      if (mode === "messages") {
        const msgChunk = Array.isArray(data) ? data[0] : data;
        if (await handleToolResultMessage(msgChunk)) continue;
        if (isAiMessage(msgChunk) || msgChunk?.tool_call_chunks) {
          await handleAiStreamChunk(msgChunk);
        }
      } else if (mode === "updates") {
        for (const [, state] of Object.entries(data as Record<string, any>)) {
          const batch = messagesFromUpdateValue(state);
          if (batch.length === 0) continue;

          for (const msg of batch) {
            if (isAiMessage(msg) || (Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0)) {
              await flushUnstreamedFromAiMessage(msg);
            }
            await handleAiToolCalls(msg);
            await handleToolResultMessage(msg);
          }
        }
      }
    }

    if (abortSignal?.aborted) {
      await flushOpenTools("cancelled");
      await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "cancelled" }) });
      return;
    }

    await flushOpenTools("Tool did not return a result");
    await stream.writeSSE({ data: JSON.stringify({ type: "done" }) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = abortSignal?.aborted || (err as Error)?.name === "AbortError" || msg.includes("AbortError") || msg === "AbortError" || msg.toLowerCase().includes("aborted");

    if (isAbort) {
      await flushOpenTools("cancelled");
      await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "cancelled" }) });
      return;
    }

    const isRecursionLimit = (err as any)?.constructor?.name === "GraphRecursionError" || msg.includes("Recursion limit");

    if (isRecursionLimit) {
      await flushOpenTools("Tool did not return a result");
      await stream.writeSSE({
        data: JSON.stringify({
          type: "done",
          reason: "max_steps_reached",
        }),
      });
    } else {
      await flushOpenTools(msg);
      await stream.writeSSE({
        data: JSON.stringify({ type: "error", error: msg }),
      });
    }
  } finally {
    stopHeartbeat();
  }
}
