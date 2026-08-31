/**
 * stream-agent-sse.ts — Shared SSE streaming helper for LangGraph agents.
 *
 * Encapsulates the common streaming loop used by both prompt-agent and
 * coding-agent (and any future agent services). Handles:
 *   - AI text token streaming   (messages mode)
 *   - tool-call / tool-result   (updates mode)
 *   - done / error events
 *   - SSE heartbeat pings so long tool/model waits do not hit idleTimeout
 */

import type { BaseMessage } from "@langchain/core/messages";
import type { SSEStreamingApi } from "hono/streaming";
import { extractAiMessageText, unstreamedTextRemainder } from "./ai-message-text.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreamAgentSSEOptions {
  /** A compiled LangGraph agent (returned by `createAgent`). */
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

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Run a LangGraph agent and stream its output as SSE events.
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

    const emittedToolCalls = new Set<string>();
    const pendingToolCalls = new Map<string, { name: string; argsStr: string }>();
    let streamedThisMessage = "";

    const tryParseToolArgs = (argsStr: string): unknown => {
      if (!argsStr) return {};
      try {
        return JSON.parse(argsStr);
      } catch {
        return {};
      }
    };

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

    for await (const chunk of agentStream) {
      // Check abort between chunks
      if (abortSignal?.aborted) {
        await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "cancelled" }) });
        return;
      }
      const [mode, data] = chunk as unknown as [string, any];

      if (mode === "messages") {
        const [msgChunk] = data as [any, any];
        const msgType = msgChunk?._getType?.() ?? msgChunk?.type;

        // Stream AI text + thinking tokens
        if (msgType === "ai" || msgType === "AIMessageChunk") {
          const content = msgChunk?.content;

          if (typeof content === "string" && content) {
            await writeTextDelta(content);
          } else if (Array.isArray(content)) {
            for (const block of content) {
              // Claude: {type:"thinking", thinking:"..."}
              if (block.type === "thinking" && block.thinking) {
                await stream.writeSSE({
                  data: JSON.stringify({ type: "thinking-delta", text: block.thinking }),
                });
              }
              // Reasoning: LangChain standard `{reasoning}` / Responses `{summary}` / flat `{text}`
              else if (block.type === "reasoning") {
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
              }
              // Standard text block
              else if (block.type === "text" && block.text) {
                await writeTextDelta(block.text);
              } else if (block.type === "output_text" && block.text) {
                await writeTextDelta(block.text);
              }
            }
          }

          // Fallback: reasoning in additional_kwargs (older LangChain or non-Responses API)
          const reasoning = msgChunk?.additional_kwargs?.reasoning_content ?? msgChunk?.additional_kwargs?.reasoning;
          if (typeof reasoning === "string" && reasoning) {
            await stream.writeSSE({
              data: JSON.stringify({ type: "thinking-delta", text: reasoning }),
            });
          }

          // Early tool-call: first chunk with id+name → paint Running… immediately
          if (msgChunk?.tool_call_chunks) {
            for (const tc of msgChunk.tool_call_chunks) {
              if (tc.id) {
                const pending = pendingToolCalls.get(tc.id);
                if (pending) {
                  if (tc.args) pending.argsStr += tc.args;
                } else if (tc.name) {
                  pendingToolCalls.set(tc.id, { name: tc.name, argsStr: tc.args ?? "" });
                  if (!emittedToolCalls.has(tc.id)) {
                    emittedToolCalls.add(tc.id);
                    await stream.writeSSE({
                      data: JSON.stringify({
                        type: "tool-call",
                        toolCallId: tc.id,
                        toolName: tc.name,
                        input: tryParseToolArgs(tc.args ?? ""),
                      }),
                    });
                  }
                }
              }
            }
          }
        }
      } else if (mode === "updates") {
        for (const [, state] of Object.entries(data as Record<string, any>)) {
          if (!state?.messages) continue;

          const batch = state.messages as BaseMessage[];

          for (const msg of batch as any[]) {
            const msgType = msg?._getType?.() ?? msg?.type;
            const isAi = msgType === "ai" || msgType === "AIMessage" || msgType === "AIMessageChunk";
            if (isAi || (Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0)) {
              await flushUnstreamedFromAiMessage(msg);
            }

            if (msg?.tool_calls && Array.isArray(msg.tool_calls)) {
              streamedThisMessage = "";
              for (const tc of msg.tool_calls) {
                const tcId = tc.id ?? `${tc.name}-${Date.now()}`;
                emittedToolCalls.add(tcId);
                pendingToolCalls.delete(tcId);
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "tool-call",
                    toolCallId: tcId,
                    toolName: tc.name,
                    input: tc.args,
                  }),
                });
              }
            }

            if (msgType === "tool" || msgType === "ToolMessage") {
              const toolName = msg.name ?? "unknown";
              const raw = msg.content;
              const result =
                typeof raw === "string"
                  ? (() => {
                      try {
                        return JSON.parse(raw);
                      } catch {
                        return raw;
                      }
                    })()
                  : raw;
              await stream.writeSSE({
                data: JSON.stringify({
                  type: "tool-result",
                  toolCallId: msg.tool_call_id,
                  toolName,
                  result,
                }),
              });
            }
          }
        }
      }
    }

    if (abortSignal?.aborted) {
      await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "cancelled" }) });
      return;
    }

    await stream.writeSSE({ data: JSON.stringify({ type: "done" }) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = abortSignal?.aborted || (err as Error)?.name === "AbortError" || msg.includes("AbortError") || msg === "AbortError" || msg.toLowerCase().includes("aborted");

    if (isAbort) {
      await stream.writeSSE({ data: JSON.stringify({ type: "error", error: "cancelled" }) });
      return;
    }

    const isRecursionLimit = (err as any)?.constructor?.name === "GraphRecursionError" || msg.includes("Recursion limit");

    if (isRecursionLimit) {
      // Treat recursion limit as a graceful stop, not an error
      await stream.writeSSE({
        data: JSON.stringify({
          type: "done",
          reason: "max_steps_reached",
        }),
      });
    } else {
      await stream.writeSSE({
        data: JSON.stringify({ type: "error", error: msg }),
      });
    }
  } finally {
    stopHeartbeat();
  }
}
