/**
 * useAgent.ts
 *
 * React hooks + streaming helpers for conversation-backed agents.
 * Server handles AI + persistence; this file manages SSE + React state.
 *
 * Exports:
 *   - useAgentRunner   → POST chat SSE (initial send)
 *   - useAgentAutoRun  → trigger autonomous work session
 *   - connectChatSSE   → GET /stream (F5 reconnect / multi-tab)
 *   - ChatMessage      → shared type
 */

import { useCallback, useRef, useState } from "react";
import { authorizedFetch } from "src/common/api";
import type { Agent } from "src/common/types";
import type { AgentSseCallbacks } from "src/components/chat/common/sse";
import { parseSseStream } from "src/components/chat/common/sse";
import { updateAgent, upsertAgentLocal } from "src/modules/agents/common/agentsSlice";
import { createConversation, fetchConversations } from "src/modules/agents/common/chatSlice";
import { store } from "src/store/store";

// ─── ChatMessage — shared type ────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolLabel?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  streaming?: boolean;
  createdAt: Date;
}

// ─── Stream Helpers (internal) ────────────────────────────────────────────────

interface AgentStreamCallbacks {
  onChunk: (chunk: string) => void;
  onThinking: (chunk: string) => void;
  onToolCall: (call: { toolCallId?: string; toolName: string; toolLabel?: string; toolIcon?: string | null; input: unknown }) => void;
  onToolResult: (call: { toolCallId?: string; toolName: string; result: unknown }) => void;
  onDone: (text: string) => void;
  onError: (err: string) => void;
  abortSignal?: AbortSignal;
  password?: string;
  token?: string;
}

function toSseCallbacks(callbacks: {
  onChunk: (chunk: string) => void;
  onThinking: (chunk: string) => void;
  onToolCall: AgentStreamCallbacks["onToolCall"];
  onToolResult: AgentStreamCallbacks["onToolResult"];
  onDone: (text: string) => void | Promise<void>;
  onError: (err: string) => void | Promise<void>;
}): AgentSseCallbacks {
  return {
    onTextDelta: callbacks.onChunk,
    onThinkingDelta: callbacks.onThinking,
    onToolCall: callbacks.onToolCall,
    onToolResult: callbacks.onToolResult,
    onDone: callbacks.onDone,
    onError: callbacks.onError,
  };
}

/**
 * Stream chat from server-side agent.
 * Auth: POST /api/conversations/:id/chat
 * Guest: POST /api/public/agents/:id/conversations/:convId/chat?fp=
 */
async function streamAgentChat(agentId: string, message: string, conversationId: string, callbacks: AgentStreamCallbacks, options?: { fingerprint?: string }): Promise<void> {
  const { onChunk, onThinking, onToolCall, onToolResult, onDone, onError, abortSignal, password, token } = callbacks;

  if (abortSignal?.aborted) return;

  const BASE_URL: string = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";

  const url = options?.fingerprint ? `${BASE_URL}/api/public/agents/${agentId}/conversations/${conversationId}/chat?fp=${encodeURIComponent(options.fingerprint)}` : `${BASE_URL}/api/conversations/${conversationId}/chat`;

  let res: Response;
  try {
    if (options?.fingerprint) {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, password, token }),
        signal: abortSignal,
      });
    } else {
      res = await authorizedFetch(url, {
        method: "POST",
        body: JSON.stringify({ agentId, message, password, token }),
        signal: abortSignal,
      });
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError((err as Error).message ?? "Network error");
    return;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "Request failed");
    onError(text);
    return;
  }

  await parseSseStream(res.body, toSseCallbacks({ onChunk, onThinking, onToolCall, onToolResult, onDone, onError }), {
    signal: abortSignal,
  });
}

/**
 * Stop a running background stream — POST /api/agents/:id/chat/stop
 */
export async function stopAgentChat(agentId: string, conversationId: string): Promise<void> {
  const BASE_URL: string = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";
  try {
    await authorizedFetch(`${BASE_URL}/api/agents/${agentId}/chat/stop`, {
      method: "POST",
      body: JSON.stringify({ conversationId }),
    });
  } catch {
    // best-effort — ignore errors
  }
}

// ─── SSE reconnect helper ─────────────────────────────────────────────────────

interface ChatSSECallbacks {
  onChunk: (chunk: string) => void;
  onThinking: (chunk: string) => void;
  onToolCall: (call: { toolCallId?: string; toolName: string; toolLabel?: string; toolIcon?: string | null; input: unknown }) => void;
  onToolResult: (call: { toolCallId?: string; toolName: string; result: unknown }) => void;
  onDone: (text: string) => void;
  onError: (err: string) => void;
  abortSignal?: AbortSignal;
}

/**
 * Connect to SSE stream for a running conversation (F5 / multi-tab).
 * Uses fetch + Authorization (EventSource cannot send Bearer tokens and is
 * unreliable through the Vite proxy).
 *
 * @returns Cleanup function that aborts the stream.
 */
export function connectChatSSE(conversationId: string, callbacks: ChatSSECallbacks, options?: { fingerprint?: string; agentId?: string }): () => void {
  const BASE_URL: string = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";

  let url: string;
  if (options?.fingerprint && options?.agentId) {
    url = `${BASE_URL}/api/public/agents/${options.agentId}/conversations/${conversationId}/stream?fp=${options.fingerprint}`;
  } else {
    url = `${BASE_URL}/api/conversations/${conversationId}/stream`;
  }

  const abort = new AbortController();
  const externalSignal = callbacks.abortSignal;
  const onExternalAbort = () => abort.abort();
  if (externalSignal) {
    if (externalSignal.aborted) abort.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  let closedByUs = false;

  const run = async () => {
    let res: Response;
    try {
      if (options?.fingerprint) {
        res = await fetch(url, { method: "GET", headers: { Accept: "text/event-stream" }, signal: abort.signal });
      } else {
        res = await authorizedFetch(url, { method: "GET", headers: { Accept: "text/event-stream" }, signal: abort.signal });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError" || closedByUs || abort.signal.aborted) return;
      callbacks.onError("Connection lost");
      return;
    }

    if (!res.ok || !res.body) {
      if (closedByUs || abort.signal.aborted) return;
      callbacks.onError(res.status === 404 ? "No active stream" : "Connection lost");
      return;
    }

    await parseSseStream(
      res.body,
      toSseCallbacks({
        ...callbacks,
        onDone: (text) => {
          if (closedByUs || abort.signal.aborted) return;
          return callbacks.onDone(text);
        },
        onError: (err) => {
          if (closedByUs || abort.signal.aborted) return;
          return callbacks.onError(err);
        },
      }),
      { signal: abort.signal },
    );
  };

  void run();

  return () => {
    closedByUs = true;
    abort.abort();
    externalSignal?.removeEventListener("abort", onExternalAbort);
  };
}

// ─── useAgentRunner ───────────────────────────────────────────────────────────
// FE only manages streaming state + UI callbacks.
// Server handles: history load, message save, conversation status.

interface RunOptions {
  agent: Agent;
  conversationId: string;
  userMessage: string;
  onChunk: (chunk: string) => void;
  onThinking?: (chunk: string) => void;
  onToolCall: (call: { toolCallId?: string; toolName: string; toolLabel?: string; toolIcon?: string | null; input: unknown }) => void;
  onToolResult: (call: { toolCallId?: string; toolName: string; result: unknown }) => void;
  /** Called when server is done — messages already saved by server */
  onDone: (text: string) => void;
  onError: (err: string) => void;
  password?: string;
  token?: string;
  /** Guest public chat — routes through /api/public with fingerprint ownership */
  fingerprint?: string;
}

export function useAgentRunner() {
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<number>(0);
  // Track current run's agent + conversation for stop endpoint
  const agentIdRef = useRef<string>("");
  const conversationIdRef = useRef<string>("");

  const run = useCallback(async (options: RunOptions) => {
    const { agent, conversationId, userMessage, onChunk, onThinking, onToolCall, onToolResult, onDone, onError, password, token, fingerprint } = options;

    agentIdRef.current = agent.id;
    conversationIdRef.current = conversationId;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const currentRunId = ++runIdRef.current;

    setRunning(true);

    try {
      await streamAgentChat(
        agent.id,
        userMessage,
        conversationId,
        {
          onChunk,
          onThinking: onThinking ?? (() => {}),
          onToolCall,
          onToolResult,
          onDone,
          onError,
          abortSignal: abort.signal,
          password,
          token,
        },
        fingerprint ? { fingerprint } : undefined,
      );
    } finally {
      if (runIdRef.current === currentRunId) {
        setRunning(false);
      }
    }
  }, []);

  const cancel = useCallback(() => {
    if (agentIdRef.current && conversationIdRef.current) {
      stopAgentChat(agentIdRef.current, conversationIdRef.current).catch(() => {});
    }
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  return { run, running, cancel };
}

// ─── useAgentAutoRun ──────────────────────────────────────────────────────────
// Trigger one autonomous "work session" for an agent.
// Server saves messages + updates conversation status automatically.

const DEFAULT_START_MESSAGE = "Start working. Please complete your task and report the results.";

export function useAgentAutoRun() {
  const { run } = useAgentRunner();
  const runningAgents = useRef<Set<string>>(new Set());

  const trigger = useCallback(
    async (agent: Agent) => {
      if (runningAgents.current.has(agent.id)) return;
      runningAgents.current.add(agent.id);
      store.dispatch(upsertAgentLocal({ id: agent.id, runStatus: "running" }));

      const userMessage = agent.startMessage?.trim() || DEFAULT_START_MESSAGE;

      const conv = await store.dispatch(createConversation({ agentId: agent.id, title: "Auto run", trigger: "cron" })).unwrap();
      const conversationId = conv.id;

      run({
        agent,
        conversationId,
        userMessage,

        onChunk: () => {},

        onToolCall: ({ toolName, toolLabel }) => {
          console.debug(`[AutoRun] ${agent.name} → tool: ${toolLabel ?? toolName}`);
        },

        onToolResult: ({ toolName, result }) => {
          console.debug(`[AutoRun] ${agent.name} ← result:`, toolName, result);
        },

        onDone: async () => {
          await store.dispatch(updateAgent({ id: agent.id, lastRunAt: new Date() }));
          store.dispatch(upsertAgentLocal({ id: agent.id, runStatus: "idle" }));
          runningAgents.current.delete(agent.id);
          void store.dispatch(fetchConversations(agent.id));
          console.info(`[AutoRun] ${agent.name} done → idle`);
        },

        onError: async (err) => {
          console.error(`[AutoRun] ${agent.name} error:`, err);
          await store.dispatch(updateAgent({ id: agent.id, lastRunAt: new Date() }));
          store.dispatch(upsertAgentLocal({ id: agent.id, runStatus: "idle" }));
          runningAgents.current.delete(agent.id);
          void store.dispatch(fetchConversations(agent.id));
        },
      });
    },
    [run],
  );

  return { trigger };
}
