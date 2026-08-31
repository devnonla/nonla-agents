/**
 * Auto-resume a background conversation stream via GET /stream (F5 / multi-tab).
 * Shared by admin ChatPage and public guest chat.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { connectChatSSE } from "./useAgent";
import type { SSECallbacks } from "./useChatStreaming";

export interface UseStreamResumeOptions {
  running: boolean;
  conversationId: string | null;
  /** True when server conversation status is "running" */
  isServerRunning: boolean;
  buildSSECallbacks: (convId: string) => SSECallbacks;
  loadMessages: (convId: string) => void | Promise<void>;
  /** Clear local streaming overlay before attaching (admin chat) */
  clearStreamingState?: () => void;
  /** Called when this tab attaches to a resume stream */
  onAttach?: (convId: string) => void;
  /** Public guest: fingerprint + agentId for ownership-checked stream URL */
  connectOptions?: { fingerprint?: string; agentId?: string };
  /** Retry GET /stream a few times after Connection lost (admin multi-tab) */
  retryOnConnectionLost?: boolean;
  maxRetries?: number;
}

export function useStreamResume({ running, conversationId, isServerRunning, buildSSECallbacks, loadMessages, clearStreamingState, onAttach, connectOptions, retryOnConnectionLost = false, maxRetries = 8 }: UseStreamResumeOptions) {
  const suppressResumeConvIdRef = useRef<string | null>(null);
  const [resumeNonce, setResumeNonce] = useState(0);
  const resumeAttemptsRef = useRef(0);
  const resumeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildSSECallbacksRef = useRef(buildSSECallbacks);
  buildSSECallbacksRef.current = buildSSECallbacks;
  const loadMessagesRef = useRef(loadMessages);
  loadMessagesRef.current = loadMessages;
  const clearStreamingStateRef = useRef(clearStreamingState);
  clearStreamingStateRef.current = clearStreamingState;
  const onAttachRef = useRef(onAttach);
  onAttachRef.current = onAttach;
  const connectOptionsRef = useRef(connectOptions);
  connectOptionsRef.current = connectOptions;

  const markTerminal = useCallback((convId: string) => {
    suppressResumeConvIdRef.current = convId;
  }, []);

  const handleConnectionLost = useCallback(() => {
    suppressResumeConvIdRef.current = null;
    if (!retryOnConnectionLost) return;
    if (resumeAttemptsRef.current >= maxRetries) return;
    resumeAttemptsRef.current += 1;
    if (resumeRetryTimerRef.current) clearTimeout(resumeRetryTimerRef.current);
    resumeRetryTimerRef.current = setTimeout(() => {
      setResumeNonce((n) => n + 1);
    }, 800);
  }, [retryOnConnectionLost, maxRetries]);

  useEffect(() => {
    return () => {
      if (resumeRetryTimerRef.current) clearTimeout(resumeRetryTimerRef.current);
    };
  }, []);

  const connectKey = connectOptions?.fingerprint && connectOptions?.agentId ? `${connectOptions.agentId}:${connectOptions.fingerprint}` : "";

  useEffect(() => {
    if (running) return;

    if (!isServerRunning || !conversationId) {
      if (!isServerRunning) {
        suppressResumeConvIdRef.current = null;
        resumeAttemptsRef.current = 0;
      }
      return;
    }

    if (suppressResumeConvIdRef.current === conversationId) return;

    clearStreamingStateRef.current?.();
    onAttachRef.current?.(conversationId);

    const resumeConvId = conversationId;
    void loadMessagesRef.current(resumeConvId);

    const callbacks = buildSSECallbacksRef.current(resumeConvId);
    const abort = new AbortController();
    const opts = connectOptionsRef.current;
    const cleanup = connectChatSSE(
      resumeConvId,
      {
        ...callbacks,
        abortSignal: abort.signal,
      },
      opts?.fingerprint && opts?.agentId ? { fingerprint: opts.fingerprint, agentId: opts.agentId } : undefined,
    );

    return () => {
      abort.abort();
      cleanup();
    };
  }, [isServerRunning, running, conversationId, resumeNonce, connectKey]);

  return {
    suppressResumeConvIdRef,
    markTerminal,
    handleConnectionLost,
  };
}
