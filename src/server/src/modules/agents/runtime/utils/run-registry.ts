/**
 * runRegistry — in-memory registry of active AI streaming runs.
 *
 * Design:
 *   - Each run is keyed by conversationId
 *   - Run lifecycle is INDEPENDENT of any HTTP connection (F5-resilient)
 *   - Structural events (tool/done/error) are buffered for replay
 *   - Live text/thinking is kept as a snapshot (avoids duplicating DB messages on F5)
 *   - Multiple SSE clients can subscribe to the same run
 *   - Stop endpoint calls cancel() to abort the background AI task
 */

import type { SSEStreamingApi } from "hono/streaming";
import type { AgentStreamEvent } from "./agentRunner.js";

type RunSubscriber = (event: AgentStreamEvent) => void;

interface ActiveRun {
  runId: symbol;
  abort: AbortController;
  agentId: string;
  conversationId: string;
  subscribers: Set<RunSubscriber>;
  /** Structural events only (tool-call / tool-result / done / error) */
  eventBuffer: AgentStreamEvent[];
  /** Unsaved assistant text since last tool-call / segment flush */
  liveText: string;
  /** Unsaved thinking text since last flush */
  liveThinking: string;
  finished: boolean;
  /** Last time any event was emitted (for stall watchdog) */
  lastEventAt: number;
}

const REPLAY_GRACE_MS = 60_000;
/** Keep SSE sockets warm through proxies / Bun idleTimeout (120s). */
export const SSE_HEARTBEAT_MS = 15_000;

class RunRegistry {
  private runs = new Map<string, ActiveRun>();

  isCurrent(conversationId: string, runId: symbol): boolean {
    const run = this.runs.get(conversationId);
    return !!run && run.runId === runId && !run.finished;
  }

  /** True while a run exists and is not finished (or still in replay grace if finished). */
  has(conversationId: string): boolean {
    return this.runs.has(conversationId);
  }

  /** True when there is an unfinished run for this conversation. */
  isActive(conversationId: string): boolean {
    const run = this.runs.get(conversationId);
    return !!run && !run.finished;
  }

  lastEventAt(conversationId: string): number | null {
    return this.runs.get(conversationId)?.lastEventAt ?? null;
  }

  /** Register a new run. Cancels any existing run and unblocks its relays. */
  create(conversationId: string, agentId: string): { abort: AbortController; runId: symbol } {
    const existing = this.runs.get(conversationId);
    if (existing) {
      existing.abort.abort();
      // Unblock old relays still waiting on the superseded run
      const cancelEvent: AgentStreamEvent = { type: "error", error: "cancelled" };
      existing.eventBuffer.push(cancelEvent);
      existing.finished = true;
      for (const sub of existing.subscribers) {
        try {
          sub(cancelEvent);
        } catch {
          /* ignore */
        }
      }
      existing.subscribers.clear();
    }

    const runId = Symbol(conversationId);
    const abort = new AbortController();
    this.runs.set(conversationId, {
      runId,
      abort,
      agentId,
      conversationId,
      subscribers: new Set(),
      eventBuffer: [],
      liveText: "",
      liveThinking: "",
      finished: false,
      lastEventAt: Date.now(),
    });
    return { abort, runId };
  }

  /**
   * Subscribe to events from a run.
   * Replays structural events + current unsaved text snapshot, then receives live events.
   */
  subscribe(conversationId: string, cb: RunSubscriber): () => void {
    const run = this.runs.get(conversationId);
    if (!run) return () => {};

    let alive = true;
    const safeCb: RunSubscriber = (event) => {
      if (!alive) return;
      cb(event);
    };

    // 1. Replay structural events (tool calls, results, terminal)
    for (const event of run.eventBuffer) {
      safeCb(event);
    }

    const last = run.eventBuffer[run.eventBuffer.length - 1];
    if (last?.type === "done" || last?.type === "error" || run.finished) {
      return () => {
        alive = false;
      };
    }

    // 2. Catch up unsaved streaming text (not in DB yet) as a single snapshot
    if (run.liveThinking) {
      safeCb({ type: "thinking-delta", text: run.liveThinking });
    }
    if (run.liveText) {
      safeCb({ type: "text-delta", text: run.liveText });
    }

    // 3. Live events from here
    run.subscribers.add(safeCb);
    return () => {
      alive = false;
      run.subscribers.delete(safeCb);
    };
  }

  /**
   * Fan-out an event. No-ops if runId is not the current run (superseded).
   * Text/thinking deltas update the live snapshot but are NOT buffered (F5 uses snapshot).
   */
  emit(conversationId: string, event: AgentStreamEvent, runId: symbol) {
    const run = this.runs.get(conversationId);
    if (!run || run.runId !== runId || run.finished) return;

    run.lastEventAt = Date.now();

    if (event.type === "text-delta") {
      // Thinking was flushed to DB before text starts
      run.liveThinking = "";
      run.liveText += event.text;
      for (const sub of run.subscribers) {
        try {
          sub(event);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (event.type === "thinking-delta") {
      // Prior assistant text was flushed to DB before a new thinking round
      run.liveText = "";
      run.liveThinking += event.text;
      for (const sub of run.subscribers) {
        try {
          sub(event);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    // Structural event — text was (or will be) persisted; clear live snapshot
    if (event.type === "tool-call" || event.type === "done" || event.type === "error") {
      run.liveText = "";
      run.liveThinking = "";
    }

    run.eventBuffer.push(event);
    for (const sub of run.subscribers) {
      try {
        sub(event);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Abort the background AI task and immediately unblock SSE relays with a
   * terminal `cancelled` event. Background finally may still run later; it
   * no-ops DB writes if the run is already finished here — callers that need
   * DB status should update status themselves (watchdog / forced finish).
   */
  cancel(conversationId: string): boolean {
    const run = this.runs.get(conversationId);
    if (!run || run.finished) return false;
    run.abort.abort();

    const cancelEvent: AgentStreamEvent = { type: "error", error: "cancelled" };
    run.eventBuffer.push(cancelEvent);
    run.finished = true;
    run.liveText = "";
    run.liveThinking = "";
    run.lastEventAt = Date.now();

    for (const sub of run.subscribers) {
      try {
        sub(cancelEvent);
      } catch {
        /* ignore */
      }
    }
    run.subscribers.clear();

    // Keep briefly for late F5 reconnects (same grace as finish)
    const runId = run.runId;
    setTimeout(() => {
      const current = this.runs.get(conversationId);
      if (current?.runId === runId) this.runs.delete(conversationId);
    }, REPLAY_GRACE_MS);

    return true;
  }

  /**
   * Mark a run finished and keep it briefly for late F5 reconnects to replay.
   * No-ops if this run was superseded by a newer create().
   */
  finish(conversationId: string, runId: symbol) {
    const run = this.runs.get(conversationId);
    if (!run || run.runId !== runId) return;
    run.finished = true;
    run.liveText = "";
    run.liveThinking = "";
    setTimeout(() => {
      const current = this.runs.get(conversationId);
      if (current?.runId === runId) this.runs.delete(conversationId);
    }, REPLAY_GRACE_MS);
  }

  /** Abort + emit stalled error + finish if still the current unfinished run. */
  stall(conversationId: string, runId: symbol, message = "Stream stalled (no activity)"): boolean {
    const run = this.runs.get(conversationId);
    if (!run || run.runId !== runId || run.finished) return false;
    run.abort.abort();
    this.emit(conversationId, { type: "error", error: message }, runId);
    this.finish(conversationId, runId);
    return true;
  }
}

export const runRegistry = new RunRegistry();

/**
 * Relay runRegistry events into an SSE response.
 * Client disconnect only unsubscribes — it does NOT cancel the background run.
 * Sends periodic ping events so Bun/proxy idleTimeouts do not kill long tool waits.
 */
export async function relayRunToSSE(conversationId: string, stream: SSEStreamingApi): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      resolve();
    };

    const unsub = runRegistry.subscribe(conversationId, (event) => {
      stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {
        unsub();
        finish();
      });
      if (event.type === "done" || event.type === "error") {
        unsub();
        finish();
      }
    });

    // Replay may have already delivered a terminal event synchronously
    if (settled) return;

    if (!runRegistry.has(conversationId)) {
      unsub();
      stream.writeSSE({ data: JSON.stringify({ type: "error", error: "No active stream" }) }).finally(() => finish());
      return;
    }

    heartbeat = setInterval(() => {
      stream.writeSSE({ data: JSON.stringify({ type: "ping" }) }).catch(() => {
        unsub();
        finish();
      });
    }, SSE_HEARTBEAT_MS);

    stream.onAbort(() => {
      unsub();
      finish();
    });
  });
}
