/**
 * Ephemeral assistant streaming (prompt / coding panels).
 * Local message history only — no conversation DB / run-registry.
 *
 * Message cycles mirror the model loop:
 *   thinking → (text)? → tool-call → thinking → …
 * Each thinking / assistant segment becomes its own bubble so multi-round
 * reasoning is never concatenated into one block.
 *
 * Domain-specific tool labels / turn-summary hints are injected by callers
 * (site / tool / job / prompt) — history compaction lives on the server.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { authorizedFetch } from "src/common/api";
import { parseSseStream } from "src/components/chat/common/sse";
import type { ChatAgentMessage } from "src/components/chat/common/types";
import { formatToolName, nextId } from "src/components/chat/common/utils";

export type ToolActionEvent = { type: "tool-call"; toolName: string; toolLabel: string; input: unknown } | { type: "tool-result"; toolName: string; output: unknown };

export type SummarizeToolCallFn = (m: ChatAgentMessage) => string | null;
export type TurnSummaryHintFn = (turn: ChatAgentMessage[]) => string;

export interface UseAssistantStreamingOptions {
  streamUrl: string;
  onToolAction?: (event: ToolActionEvent) => void;
  /** Domain policy: human line for UI-only turn summary */
  summarizeToolCall?: SummarizeToolCallFn;
  /** Domain policy: extra footer on UI-only turn summary (e.g. Approve hint) */
  turnSummaryHint?: TurnSummaryHintFn;
}

export function buildAiHistory(messages: ChatAgentMessage[]) {
  return messages
    .filter((m) => {
      if (m.meta?.uiOnly) return false;
      if (m.role === "user") return m.content.trim() !== "";
      if (m.role === "assistant") return m.content.trim() !== "";
      if (m.role === "tool-call") return m.toolOutput != null;
      return false;
    })
    .map((m) => {
      if (m.role === "tool-call") {
        return {
          role: "tool-call" as const,
          content: "",
          toolCallId: m.toolCallId,
          toolName: m.toolName,
          toolInput: m.toolInput,
          toolOutput: m.toolOutput,
        };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    });
}

function finalizeStreamingMessages(prev: ChatAgentMessage[]) {
  return prev
    .map((m) => {
      if (m.role === "assistant" && m.streaming) {
        // Reasoning-only: keep as thinking row — never promote thinking → assistant text.
        if (!m.content.trim() && m.meta?.thinking) {
          return {
            id: m.id,
            role: "thinking" as const,
            content: String(m.meta.thinking),
            streaming: false,
            timestamp: m.timestamp,
            meta: {
              thinking: m.meta.thinking,
              ...(typeof m.meta.thinkingDuration === "number" ? { thinkingDuration: m.meta.thinkingDuration } : {}),
            },
          };
        }
        return { ...m, streaming: false };
      }
      return m;
    })
    .filter((m) => !(m.role === "assistant" && !m.content.trim() && !m.meta?.thinking));
}

function defaultToolCallLine(m: ChatAgentMessage): string | null {
  if (m.role !== "tool-call") return null;
  const label = m.toolLabel ?? formatToolName(m.toolName || "tool");
  return `Ran ${label}`;
}

/** When the model only emits thinking + tools, still show a closing summary (UI-only). */
function ensureTurnSummary(prev: ChatAgentMessage[], turnHadVisibleText: boolean, summarizeToolCall?: SummarizeToolCallFn, turnSummaryHint?: TurnSummaryHintFn): ChatAgentMessage[] {
  const finalized = finalizeStreamingMessages(prev);
  if (turnHadVisibleText) return finalized;

  let lastUserIdx = -1;
  for (let i = finalized.length - 1; i >= 0; i--) {
    if (finalized[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx === -1) return finalized;

  const turn = finalized.slice(lastUserIdx + 1);
  if (turn.some((m) => m.role === "assistant" && m.content.trim())) return finalized;

  const lines = turn.map((m) => summarizeToolCall?.(m) ?? defaultToolCallLine(m)).filter((line): line is string => Boolean(line));
  if (lines.length === 0) return finalized;

  const unique = [...new Set(lines)];
  const body = unique.map((line) => `- ${line}`).join("\n");
  const hint = turnSummaryHint?.(turn) ?? "";

  return [
    ...finalized,
    {
      id: nextId("a"),
      role: "assistant" as const,
      content: `Here's what I did:\n${body}${hint}`,
      streaming: false,
      timestamp: new Date(),
      meta: { uiOnly: true },
    },
  ];
}

function thinkingDurationSec(startedAt: number): number {
  if (!startedAt) return 0;
  return Math.round((Date.now() - startedAt) / 1000);
}

export function useAssistantStreaming({ streamUrl, onToolAction, summarizeToolCall, turnSummaryHint }: UseAssistantStreamingOptions) {
  const [messages, setMessages] = useState<ChatAgentMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  const thinkingRef = useRef("");
  const thinkingStartRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const onToolActionRef = useRef(onToolAction);
  onToolActionRef.current = onToolAction;
  const summarizeToolCallRef = useRef(summarizeToolCall);
  summarizeToolCallRef.current = summarizeToolCall;
  const turnSummaryHintRef = useRef(turnSummaryHint);
  turnSummaryHintRef.current = turnSummaryHint;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages(finalizeStreamingMessages);
    setGenerating(false);
    thinkingRef.current = "";
    thinkingStartRef.current = 0;
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setGenerating(false);
    thinkingRef.current = "";
    thinkingStartRef.current = 0;
  }, []);

  const send = useCallback(
    async (text: string, options: { providerId: string; model: string; extraContext?: string }) => {
      const { providerId, model } = options;
      if (!text.trim() || generating) return;
      if (!providerId || !model) return;
      const extra = options.extraContext?.trim();
      const apiContent = extra ? `${extra}\n\n${text}` : text;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: ChatAgentMessage = {
        id: nextId("u"),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      const assistantId = nextId("a");
      const assistantMsg: ChatAgentMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        timestamp: new Date(),
      };

      const historySnapshot = messages;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setGenerating(true);
      thinkingRef.current = "";
      thinkingStartRef.current = 0;

      const aiHistory = buildAiHistory(historySnapshot);

      let assistantText = "";
      let currentAssistantId = assistantId;
      let needsNewBubble = false;
      let lastFrozenAssistantId = "";
      /** True when the frozen bubble already had visible text (not an empty/thinking-only row). */
      let lastFrozenHadContent = false;
      let awaitingToolResult = false;
      const seenToolCallIds = new Set<string>();
      let turnHadVisibleText = false;

      const applyTurnSummary = (prev: ChatAgentMessage[]) => ensureTurnSummary(prev, turnHadVisibleText, summarizeToolCallRef.current, turnSummaryHintRef.current);

      const finalizeOpenBubble = () => {
        const freezeId = currentAssistantId;
        // Parallel tool-calls after the first have no open bubble — keep the
        // previous freeze so interleaved text is not treated as late preamble.
        if (freezeId) {
          lastFrozenAssistantId = freezeId;
          lastFrozenHadContent = Boolean(assistantText.trim());
          const thinkingSnapshot = thinkingRef.current;
          // onTextDelta may already have stamped thinkingDuration and cleared the start ref —
          // don't overwrite that with 0 when freezing for a tool-call.
          const liveDuration = thinkingStartRef.current > 0 ? thinkingDurationSec(thinkingStartRef.current) : undefined;

          if (assistantText.trim()) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== freezeId) return m;
                if (!thinkingSnapshot) {
                  return { ...m, content: assistantText, streaming: false };
                }
                const existingDuration = typeof m.meta?.thinkingDuration === "number" ? m.meta.thinkingDuration : undefined;
                const thinkingDuration = liveDuration ?? existingDuration ?? 0;
                return {
                  ...m,
                  content: assistantText,
                  streaming: false,
                  meta: { ...m.meta, thinking: thinkingSnapshot, thinkingDuration },
                };
              }),
            );
          } else if (thinkingSnapshot) {
            // Reasoning-only segment before a tool-call — keep as thinking row (tools follow).
            const thinkingDuration = liveDuration ?? 0;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === freezeId
                  ? {
                      id: freezeId,
                      role: "thinking" as const,
                      content: thinkingSnapshot,
                      streaming: false,
                      timestamp: m.timestamp,
                      meta: { thinking: thinkingSnapshot, thinkingDuration },
                    }
                  : m,
              ),
            );
          } else {
            setMessages((prev) => prev.filter((m) => m.id !== freezeId));
          }
        }

        thinkingRef.current = "";
        thinkingStartRef.current = 0;
        assistantText = "";
        currentAssistantId = "";
        needsNewBubble = true;
      };

      const ensureAssistantBubble = (seed?: { content?: string; thinking?: string }): string => {
        if (!needsNewBubble && currentAssistantId) return currentAssistantId;
        const newId = nextId("a");
        currentAssistantId = newId;
        needsNewBubble = false;
        const bubble: ChatAgentMessage = {
          id: newId,
          role: "assistant",
          content: seed?.content ?? "",
          streaming: true,
          timestamp: new Date(),
          meta: seed?.thinking ? { thinking: seed.thinking } : undefined,
        };
        setMessages((prev) => [...prev, bubble]);
        return newId;
      };

      try {
        const response = await authorizedFetch(streamUrl, {
          method: "POST",
          body: JSON.stringify({
            providerId,
            modelId: model,
            messages: [...aiHistory, { role: "user", content: apiContent }],
            publicOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const errText = await response.text();
          throw new Error(errText || `HTTP ${response.status}`);
        }

        const result = await parseSseStream(
          response.body,
          {
            onTextDelta: (delta) => {
              turnHadVisibleText = true;
              if (thinkingRef.current && thinkingStartRef.current) {
                const duration = thinkingDurationSec(thinkingStartRef.current);
                const targetId = currentAssistantId || lastFrozenAssistantId;
                if (targetId) {
                  setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, meta: { ...m.meta, thinkingDuration: duration } } : m)));
                }
                thinkingStartRef.current = 0;
              }

              // Late preamble: tool-call arrived before any text — splice in front of tools.
              // Interleaved text (already froze a visible preamble) must be a new bubble
              // after the tools, not appended onto the previous assistant.
              if (awaitingToolResult && lastFrozenAssistantId && !lastFrozenHadContent) {
                setMessages((prev) => {
                  const idx = prev.findIndex((m) => m.id === lastFrozenAssistantId && m.role === "assistant");
                  if (idx !== -1) {
                    return prev.map((m, i) => (i === idx ? { ...m, content: m.content + delta } : m));
                  }
                  let insertAt = prev.length;
                  for (let i = prev.length - 1; i >= 0; i--) {
                    if (prev[i].role === "tool-call") insertAt = i;
                    else break;
                  }
                  const row: ChatAgentMessage = {
                    id: lastFrozenAssistantId,
                    role: "assistant",
                    content: delta,
                    streaming: false,
                    timestamp: new Date(),
                  };
                  return [...prev.slice(0, insertAt), row, ...prev.slice(insertAt)];
                });
                return;
              }

              if (awaitingToolResult && lastFrozenHadContent) {
                awaitingToolResult = false;
              }

              if (needsNewBubble || !currentAssistantId) {
                assistantText = delta;
                thinkingRef.current = "";
                thinkingStartRef.current = 0;
                ensureAssistantBubble({ content: delta });
              } else {
                assistantText += delta;
                const targetId = currentAssistantId;
                setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, content: assistantText, streaming: true } : m)));
              }
            },
            onThinkingDelta: (delta) => {
              if (needsNewBubble || !currentAssistantId) {
                thinkingRef.current = delta;
                thinkingStartRef.current = Date.now();
                assistantText = "";
                ensureAssistantBubble({ thinking: delta });
                return;
              }

              if (!thinkingRef.current) {
                thinkingStartRef.current = Date.now();
              }
              thinkingRef.current += delta;
              const thinking = thinkingRef.current;
              const targetId = currentAssistantId;
              setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, meta: { ...m.meta, thinking } } : m)));
            },
            onToolCall: (event) => {
              const tLabel = event.toolLabel ? (event.toolLabel.includes(" ") ? event.toolLabel : formatToolName(event.toolLabel)) : formatToolName(event.toolName);

              const alreadySeen = event.toolCallId ? seenToolCallIds.has(event.toolCallId) : false;
              if (event.toolCallId) seenToolCallIds.add(event.toolCallId);

              if (alreadySeen) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.role === "tool-call" && m.toolCallId === event.toolCallId
                      ? {
                          ...m,
                          content: event.toolName,
                          toolName: event.toolName,
                          toolLabel: tLabel,
                          toolInput: event.input !== undefined ? event.input : m.toolInput,
                        }
                      : m,
                  ),
                );
                if (event.input !== undefined) {
                  onToolActionRef.current?.({ type: "tool-call", toolName: event.toolName, toolLabel: tLabel, input: event.input });
                }
                return;
              }

              finalizeOpenBubble();
              awaitingToolResult = true;
              const toolMsg: ChatAgentMessage = {
                id: nextId("tc"),
                role: "tool-call",
                content: event.toolName,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                toolLabel: tLabel,
                toolInput: event.input,
                timestamp: new Date(),
              };
              setMessages((prev) => [...prev, toolMsg]);
              onToolActionRef.current?.({ type: "tool-call", toolName: event.toolName, toolLabel: tLabel, input: event.input });
            },
            onToolResult: (event) => {
              awaitingToolResult = false;
              const rawOutput = event.result;
              const resultStr = typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput);
              setMessages((prev) => {
                let matchIdx = -1;
                if (event.toolCallId) {
                  matchIdx = prev.findIndex((m) => m.role === "tool-call" && m.toolCallId === event.toolCallId && !m.toolOutput);
                }
                if (matchIdx === -1) {
                  const revIdx = [...prev].reverse().findIndex((m) => m.role === "tool-call" && m.toolName === event.toolName && !m.toolOutput);
                  matchIdx = revIdx === -1 ? -1 : prev.length - 1 - revIdx;
                }
                if (matchIdx === -1) return prev;
                return prev.map((m, i) => (i === matchIdx ? { ...m, toolOutput: resultStr } : m));
              });
              onToolActionRef.current?.({ type: "tool-result", toolName: event.toolName, output: rawOutput });
            },
            onDone: () => {
              awaitingToolResult = false;
              setMessages(applyTurnSummary);
              setGenerating(false);
              thinkingRef.current = "";
              thinkingStartRef.current = 0;
            },
            onError: (error) => {
              awaitingToolResult = false;
              if (error === "Connection lost") {
                setMessages(applyTurnSummary);
                setGenerating(false);
                thinkingRef.current = "";
                thinkingStartRef.current = 0;
                return;
              }
              setMessages((prev) => [
                ...finalizeStreamingMessages(prev),
                {
                  id: nextId("err"),
                  role: "error",
                  content: error,
                  timestamp: new Date(),
                },
              ]);
              setGenerating(false);
              thinkingRef.current = "";
              thinkingStartRef.current = 0;
            },
          },
          { signal: controller.signal },
        );

        if (result === "aborted") {
          setMessages(finalizeStreamingMessages);
          setGenerating(false);
          thinkingRef.current = "";
          thinkingStartRef.current = 0;
          return;
        }

        setMessages(applyTurnSummary);
        setGenerating(false);
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          setMessages(finalizeStreamingMessages);
          setGenerating(false);
          thinkingRef.current = "";
          thinkingStartRef.current = 0;
          return;
        }
        setMessages((prev) => [
          ...finalizeStreamingMessages(prev),
          {
            id: nextId("err"),
            role: "error",
            content: err instanceof Error ? err.message : String(err),
            timestamp: new Date(),
          },
        ]);
        setGenerating(false);
      } finally {
        abortRef.current = null;
      }
    },
    [generating, messages, streamUrl],
  );

  return { messages, generating, send, cancel, clear };
}
