import { useCallback, useMemo, useRef, useState } from "react";
import type { AgentMessage } from "src/common/types";
import type { ChatAgentMessage } from "src/components/chat/common/types";
import { formatToolName, isCallAgentToolName } from "src/components/chat/common/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToDisplayMsg = (m: AgentMessage) => ChatAgentMessage;
type MessageFilter = (m: ChatAgentMessage) => boolean;

export interface SSECallbacks {
  onChunk: (chunk: string) => void;
  onThinking: (chunk: string) => void;
  onToolCall: (call: { toolCallId?: string; toolName: string; toolLabel?: string; toolIcon?: string | null; input: unknown }) => void;
  onToolResult: (call: { toolCallId?: string; toolName: string; result: unknown }) => void;
  onDone: () => Promise<void> | void;
  onError: (err?: string) => Promise<void> | void;
}

export interface UseChatStreamingOptions {
  /** Convert raw AgentMessage → display format */
  toDisplayMsg: ToDisplayMsg;
  /** Optional filter applied after toDisplayMsg (e.g. hide internal tool calls) */
  messageFilter?: MessageFilter;
  /** Fetch messages from server — returns the array, hook sets state internally */
  fetchMessages: (convId: string) => Promise<AgentMessage[]>;
  /** Called when streaming finishes successfully */
  onConversationDone?: (convId: string) => void | Promise<void>;
  /** Called when streaming encounters an error */
  onConversationError?: (convId: string, error?: string) => void | Promise<void>;
}

// ─── Optimistic tool helpers ──────────────────────────────────────────────────

const OPT_PREFIX = "stream-tc-";
const SEG_PREFIX = "stream-seg-";

function isOptimisticToolId(id: string): boolean {
  return id.startsWith(OPT_PREFIX);
}

function isOptimisticSegId(id: string): boolean {
  return id.startsWith(SEG_PREFIX);
}

function toolCallIdOf(m: AgentMessage): string | undefined {
  const meta = m.metadata as Record<string, unknown> | null;
  const id = meta?.toolCallId;
  return typeof id === "string" && id ? id : undefined;
}

function hasToolOutput(m: AgentMessage): boolean {
  const meta = m.metadata as Record<string, unknown> | null;
  return meta?.toolOutput != null;
}

/**
 * Merge server rows with in-flight optimistic tool/segment bubbles.
 * Keeps stream-tc-* tools and stream-seg-* text/thinking the server hasn't persisted yet.
 */
function mergeServerWithOptimistic(serverRows: AgentMessage[], prev: AgentMessage[]): AgentMessage[] {
  const serverCallIds = new Set<string>();
  const serverSegContents = new Set<string>();
  for (const row of serverRows) {
    if (row.role === "tool") {
      const cid = toolCallIdOf(row);
      if (cid) serverCallIds.add(cid);
    } else if ((row.role === "assistant" || row.role === "thinking") && row.content.trim()) {
      serverSegContents.add(`${row.role}:${row.content}`);
    }
  }

  const pendingOptimistic = prev.filter((m) => {
    if (m.role === "tool" && isOptimisticToolId(m.id)) {
      const cid = toolCallIdOf(m);
      if (cid && serverCallIds.has(cid)) return false;
      return true;
    }
    if ((m.role === "assistant" || m.role === "thinking") && isOptimisticSegId(m.id)) {
      if (!m.content.trim()) return false;
      return !serverSegContents.has(`${m.role}:${m.content}`);
    }
    return false;
  });

  if (pendingOptimistic.length === 0) return serverRows;
  return [...serverRows, ...pendingOptimistic];
}

function upsertOptimisticTool(prev: AgentMessage[], call: { toolCallId?: string; toolName: string; toolLabel?: string; toolIcon?: string | null; input: unknown }, convId: string): AgentMessage[] {
  const { toolCallId, toolName, toolLabel, toolIcon, input } = call;
  const label = toolLabel ?? formatToolName(toolName);

  if (toolCallId) {
    const matchIdx = prev.findIndex((m) => m.role === "tool" && toolCallIdOf(m) === toolCallId);
    if (matchIdx !== -1) {
      return prev.map((m, i) => {
        if (i !== matchIdx) return m;
        const meta = { ...(m.metadata ?? {}) };
        // Prefer non-empty complete args from later upsert events
        if (input !== undefined) meta.toolInput = input;
        if (toolLabel) meta.toolLabel = toolLabel;
        if (toolIcon != null) meta.toolIcon = toolIcon;
        meta.toolName = toolName;
        meta.toolCallId = toolCallId;
        return { ...m, content: toolName, metadata: meta };
      });
    }
  }

  const id = `${OPT_PREFIX}${toolCallId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
  const optimistic: AgentMessage = {
    id,
    agentId: "",
    conversationId: convId,
    chatAgentId: null,
    role: "tool",
    content: toolName,
    metadata: {
      toolName,
      toolLabel: label,
      toolInput: input ?? {},
      toolCallId,
      ...(toolIcon != null ? { toolIcon } : {}),
    },
    createdAt: new Date(),
  };
  return [...prev, optimistic];
}

function patchOptimisticToolResult(prev: AgentMessage[], call: { toolCallId?: string; toolName: string; result: unknown }): AgentMessage[] {
  const resultStr = typeof call.result === "string" ? call.result : JSON.stringify(call.result);

  let matchIdx = -1;
  if (call.toolCallId) {
    matchIdx = prev.findIndex((m) => m.role === "tool" && toolCallIdOf(m) === call.toolCallId && !hasToolOutput(m));
  }
  if (matchIdx === -1) {
    const revIdx = [...prev].reverse().findIndex((m) => m.role === "tool" && (m.metadata as any)?.toolName === call.toolName && !hasToolOutput(m));
    matchIdx = revIdx === -1 ? -1 : prev.length - 1 - revIdx;
  }
  if (matchIdx === -1) return prev;

  return prev.map((m, i) => {
    if (i !== matchIdx) return m;
    return {
      ...m,
      metadata: {
        ...(m.metadata ?? {}),
        toolOutput: resultStr,
        result: call.result,
      },
    };
  });
}

function nextSegId(kind: string): string {
  return `${SEG_PREFIX}${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type LiveSegmentSnapshot = {
  text: string;
  thinking: string;
  thinkingDuration?: number;
  thinkingStart: number;
  /** Stable DOM id for the live assistant bubble — reuse on commit to avoid remount flicker */
  assistantId?: string;
};

/**
 * Commit the live streaming overlay into message rows (before tool-call or on done).
 * Avoids refetching /messages — SSE already has the content.
 *
 * - `split` (tool-call): thinking → standalone row, then assistant text (before the tool bubble)
 * - `combined` (done/error): thinking stays thinking; text stays assistant (thinking in meta when both).
 */
function commitLiveSegment(prev: AgentMessage[], convId: string, live: LiveSegmentSnapshot, mode: "split" | "combined" = "split"): AgentMessage[] {
  const text = live.text.trim();
  const thinking = live.thinking.trim();
  if (!text && !thinking) return prev;

  const now = new Date();
  const added: AgentMessage[] = [];
  const duration = live.thinkingDuration ?? (live.thinkingStart ? Math.round((Date.now() - live.thinkingStart) / 1000) : 0);
  const assistantId = live.assistantId ?? nextSegId("as");

  if (mode === "combined") {
    // Reasoning-only: keep as thinking — never promote into assistant content.
    if (!text && thinking) {
      added.push({
        id: nextSegId("th"),
        agentId: "",
        conversationId: convId,
        chatAgentId: null,
        role: "thinking",
        content: thinking,
        metadata: { thinkingDuration: duration },
        createdAt: now,
      });
      return [...prev, ...added];
    }

    added.push({
      id: assistantId,
      agentId: "",
      conversationId: convId,
      chatAgentId: null,
      role: "assistant",
      content: text,
      metadata: thinking ? { thinking, thinkingDuration: duration } : null,
      createdAt: now,
    });
    return [...prev, ...added];
  }

  if (thinking) {
    added.push({
      id: nextSegId("th"),
      agentId: "",
      conversationId: convId,
      chatAgentId: null,
      role: "thinking",
      content: thinking,
      metadata: { thinkingDuration: duration },
      createdAt: now,
    });
  }

  if (text) {
    added.push({
      id: assistantId,
      agentId: "",
      conversationId: convId,
      chatAgentId: null,
      role: "assistant",
      content: text,
      metadata: null,
      createdAt: now,
    });
  }

  return [...prev, ...added];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChatStreaming({ toDisplayMsg, messageFilter, fetchMessages, onConversationDone, onConversationError }: UseChatStreamingOptions) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [thinkingContent, setThinkingContent] = useState("");
  const streamingContentRef = useRef("");
  const thinkingContentRef = useRef("");
  const thinkingStartRef = useRef<number>(0);
  const thinkingDurationRef = useRef<number | undefined>(undefined);
  const [thinkingDuration, setThinkingDuration] = useState<number | undefined>(undefined);
  /** Stable id for the current live bubble — reused on commit so React does not remount */
  const liveSegIdRef = useRef<string | null>(null);
  const [liveSegId, setLiveSegId] = useState<string | null>(null);
  /** True after tool-call until next thinking/text starts — forces a fresh live bubble */
  const segmentBoundaryRef = useRef(false);
  const paintedToolIdsRef = useRef(new Set<string>());
  const lastCommittedAssistantIdRef = useRef<string | null>(null);
  /** True when the last committed live segment already had visible assistant text. */
  const lastCommittedHadContentRef = useRef(false);
  const awaitingToolResultRef = useRef(false);
  const [activityStatus, setActivityStatus] = useState("Thinking...");
  const [streamError, setStreamError] = useState<string | null>(null);

  // Keep latest callbacks in refs so buildSSECallbacks stays stable across renders
  const onDoneRef = useRef(onConversationDone);
  const onErrorRef = useRef(onConversationError);
  onDoneRef.current = onConversationDone;
  onErrorRef.current = onConversationError;

  const ensureLiveSegId = useCallback(() => {
    if (!liveSegIdRef.current) {
      liveSegIdRef.current = nextSegId("as");
      setLiveSegId(liveSegIdRef.current);
    }
    return liveSegIdRef.current;
  }, []);

  const resetLiveOverlay = useCallback(() => {
    streamingContentRef.current = "";
    thinkingContentRef.current = "";
    thinkingStartRef.current = 0;
    thinkingDurationRef.current = undefined;
    liveSegIdRef.current = null;
    setLiveSegId(null);
    setStreamingContent("");
    setThinkingContent("");
    setThinkingDuration(undefined);
  }, []);

  /** Snapshot live overlay before clearing — setState updaters may run after reset. */
  const takeLiveSnapshot = useCallback((): LiveSegmentSnapshot => {
    return {
      text: streamingContentRef.current,
      thinking: thinkingContentRef.current,
      thinkingDuration: thinkingDurationRef.current,
      thinkingStart: thinkingStartRef.current,
      assistantId: liveSegIdRef.current ?? undefined,
    };
  }, []);

  /** Clear all streaming/thinking state */
  const clearStreamingState = useCallback(() => {
    resetLiveOverlay();
    segmentBoundaryRef.current = false;
    paintedToolIdsRef.current.clear();
    lastCommittedAssistantIdRef.current = null;
    lastCommittedHadContentRef.current = false;
    awaitingToolResultRef.current = false;
    setActivityStatus("Thinking...");
    setStreamError(null);
  }, [resetLiveOverlay]);

  /** Fetch messages from server and merge with in-flight optimistic tools */
  const loadMessages = useCallback(
    async (convId: string) => {
      try {
        const rows = await fetchMessages(convId);
        setMessages((prev) => mergeServerWithOptimistic(rows, prev));
      } catch {
        // best-effort
      }
    },
    [fetchMessages],
  );

  /**
   * Build SSE callback object for a given conversation.
   * Used by both `run()` (initial send) and `connectChatSSE()` (auto-resume).
   * Stable identity — reads done/error handlers via refs.
   */
  const buildSSECallbacks = useCallback(
    (convId: string): SSECallbacks => ({
      onChunk: (chunk) => {
        setStreamError(null);
        if (thinkingStartRef.current) {
          const duration = Math.round((Date.now() - thinkingStartRef.current) / 1000);
          thinkingDurationRef.current = duration;
          setThinkingDuration(duration);
          thinkingStartRef.current = 0;
        }
        if (awaitingToolResultRef.current) {
          const id = lastCommittedAssistantIdRef.current;
          if (id && !lastCommittedHadContentRef.current) {
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === id && m.role === "assistant");
              if (idx !== -1) {
                return prev.map((m, i) => (i === idx ? { ...m, content: m.content + chunk } : m));
              }
              let insertAt = prev.length;
              for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i].role === "tool") insertAt = i;
                else break;
              }
              const row: AgentMessage = {
                id,
                agentId: "",
                conversationId: convId,
                chatAgentId: null,
                role: "assistant",
                content: chunk,
                metadata: null,
                createdAt: new Date(),
              };
              return [...prev.slice(0, insertAt), row, ...prev.slice(insertAt)];
            });
            setActivityStatus("Writing...");
            return;
          }
          if (lastCommittedHadContentRef.current) {
            awaitingToolResultRef.current = false;
          }
        }
        ensureLiveSegId();
        if (segmentBoundaryRef.current) {
          segmentBoundaryRef.current = false;
          thinkingContentRef.current = "";
          thinkingStartRef.current = 0;
          thinkingDurationRef.current = undefined;
          setThinkingContent("");
          setThinkingDuration(undefined);
          streamingContentRef.current = chunk;
          setStreamingContent(chunk);
        } else {
          streamingContentRef.current += chunk;
          setStreamingContent(streamingContentRef.current);
        }
        setActivityStatus("Writing...");
      },
      onThinking: (chunk) => {
        setStreamError(null);
        ensureLiveSegId();
        // New thinking round after tool-call must NOT append onto the previous live block
        if (segmentBoundaryRef.current) {
          segmentBoundaryRef.current = false;
          streamingContentRef.current = "";
          setStreamingContent("");
          thinkingStartRef.current = Date.now();
          thinkingDurationRef.current = undefined;
          setThinkingDuration(undefined);
          thinkingContentRef.current = chunk;
          setThinkingContent(chunk);
          setActivityStatus("Thinking...");
          return;
        }
        if (!thinkingStartRef.current) thinkingStartRef.current = Date.now();
        thinkingContentRef.current += chunk;
        setThinkingContent(thinkingContentRef.current);
        setActivityStatus("Thinking...");
      },
      onToolCall: ({ toolCallId, toolName, toolLabel, toolIcon, input }) => {
        setStreamError(null);

        const alreadyPainted = Boolean(toolCallId && paintedToolIdsRef.current.has(toolCallId));
        if (toolCallId) paintedToolIdsRef.current.add(toolCallId);

        if (alreadyPainted) {
          setMessages((prev) => upsertOptimisticTool(prev, { toolCallId, toolName, toolLabel, toolIcon, input }, convId));
        } else {
          const live = takeLiveSnapshot();
          const assistantId = live.assistantId ?? liveSegIdRef.current ?? nextSegId("as");
          const hadContent = Boolean(live.text.trim());
          // Parallel tool-calls after the first have an empty live overlay —
          // keep the previous commit so interleaved text is not treated as preamble.
          if (hadContent || live.thinking.trim() || !lastCommittedAssistantIdRef.current) {
            lastCommittedAssistantIdRef.current = assistantId;
            lastCommittedHadContentRef.current = hadContent;
          }
          resetLiveOverlay();
          segmentBoundaryRef.current = true;
          awaitingToolResultRef.current = true;
          setMessages((prev) => {
            const withSegment = commitLiveSegment(prev, convId, { ...live, assistantId }, "split");
            return upsertOptimisticTool(withSegment, { toolCallId, toolName, toolLabel, toolIcon, input }, convId);
          });
        }

        if (isCallAgentToolName(toolName)) {
          const agentName = toolLabel?.replace(/^Call\s+/i, "") ?? "agent";
          setActivityStatus(`Talking to ${agentName}...`);
        } else {
          setActivityStatus(`Running ${toolLabel ?? formatToolName(toolName)}...`);
        }
      },
      onToolResult: ({ toolCallId, toolName, result }) => {
        awaitingToolResultRef.current = false;
        setMessages((prev) => patchOptimisticToolResult(prev, { toolCallId, toolName, result }));
        setActivityStatus("Waiting for model...");
      },
      onDone: async () => {
        const live = takeLiveSnapshot();
        setMessages((prev) => commitLiveSegment(prev, convId, live, "combined"));
        resetLiveOverlay();
        segmentBoundaryRef.current = false;
        paintedToolIdsRef.current.clear();
        lastCommittedAssistantIdRef.current = null;
        lastCommittedHadContentRef.current = false;
        awaitingToolResultRef.current = false;
        setActivityStatus("Thinking...");
        setStreamError(null);
        await onDoneRef.current?.(convId);
      },
      onError: async (err) => {
        const live = takeLiveSnapshot();
        setMessages((prev) => commitLiveSegment(prev, convId, live, "combined"));
        resetLiveOverlay();
        segmentBoundaryRef.current = false;
        paintedToolIdsRef.current.clear();
        lastCommittedAssistantIdRef.current = null;
        lastCommittedHadContentRef.current = false;
        awaitingToolResultRef.current = false;
        setActivityStatus("Thinking...");
        setStreamError(null);

        // Quiet paths — do NOT mark done (server status may be failed/running).
        // Connection lost: background run may still be alive; ChatPage clears
        // resume-suppress and re-attaches via GET /stream (with event replay).
        if (err === "cancelled" || err === "No active stream" || err === "Connection lost") {
          await onErrorRef.current?.(convId, err);
          return;
        }

        const message = err?.trim() || "Something went wrong";
        setStreamError(message);
        await onErrorRef.current?.(convId, message);
      },
    }),
    [resetLiveOverlay, takeLiveSnapshot, ensureLiveSegId],
  );

  /** Computed display messages with streaming bubble / error appended */
  const baseMessages = useMemo(() => {
    const mapped = messages.map(toDisplayMsg);
    return messageFilter ? mapped.filter(messageFilter) : mapped;
  }, [messages, toDisplayMsg, messageFilter]);

  const liveMessages = useMemo<ChatAgentMessage[]>(() => {
    const result = [...baseMessages];

    if (streamingContent || thinkingContent) {
      result.push({
        id: liveSegId ?? "stream",
        role: "assistant" as const,
        content: streamingContent,
        streaming: true,
        timestamp: new Date(),
        meta: thinkingContent ? { thinking: thinkingContent, ...(thinkingDuration != null ? { thinkingDuration } : {}) } : undefined,
      });
    }

    if (streamError) {
      result.push({
        id: "stream-error",
        role: "error",
        content: streamError,
        timestamp: new Date(),
      });
    }

    return result;
  }, [baseMessages, streamingContent, thinkingContent, thinkingDuration, streamError, liveSegId]);

  return {
    messages,
    setMessages,
    streamingContent,
    thinkingContent,
    activityStatus,
    streamError,
    clearStreamingState,
    buildSSECallbacks,
    loadMessages,
    liveMessages,
  };
}
