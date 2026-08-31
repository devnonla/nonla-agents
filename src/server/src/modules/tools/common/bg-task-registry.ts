/**
 * In-memory registry for long-running custom tool processes (Cursor-style soft-wait).
 * Restart clears all entries; orphan OS processes are not re-attached.
 */

import { wsHub } from "../../../common/ws/wsHub.js";

export type BgTaskStatus = "running" | "completed" | "failed" | "cancelled";

export type BgTaskSnapshot = {
  taskId: string;
  toolId: string;
  toolName: string;
  agentId?: string;
  conversationId?: string | null;
  status: BgTaskStatus;
  startedAt: number;
  finishedAt?: number;
  result?: unknown;
  error?: string;
  console?: string;
  pid?: number;
};

type BgTaskInternal = BgTaskSnapshot & {
  kill: () => void;
  waiters: Array<(snap: BgTaskSnapshot) => void>;
  logTimer?: ReturnType<typeof setTimeout>;
};

const CONSOLE_MAX_CHARS = 256 * 1024;
const LOG_EMIT_MS = 200;

const COMPLETED_TTL_MS = 10 * 60_000;
const DEFAULT_AWAIT_MS = 60_000;

class BgTaskRegistry {
  private tasks = new Map<string, BgTaskInternal>();

  register(opts: {
    toolId: string;
    toolName: string;
    agentId?: string;
    conversationId?: string | null;
    pid?: number;
    kill: () => void;
  }): string {
    const taskId = `bg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const task: BgTaskInternal = {
      taskId,
      toolId: opts.toolId,
      toolName: opts.toolName,
      agentId: opts.agentId,
      conversationId: opts.conversationId ?? null,
      status: "running",
      startedAt: Date.now(),
      pid: opts.pid,
      kill: opts.kill,
      waiters: [],
    };
    this.tasks.set(taskId, task);
    this.emitChanged(task);
    return taskId;
  }

  get(taskId: string): BgTaskSnapshot | null {
    const t = this.tasks.get(taskId);
    return t ? this.toPublic(t) : null;
  }

  list(filter?: { agentId?: string; conversationId?: string | null }): BgTaskSnapshot[] {
    const items: BgTaskSnapshot[] = [];
    for (const t of this.tasks.values()) {
      if (filter?.agentId && t.agentId !== filter.agentId) continue;
      if (filter?.conversationId !== undefined && filter.conversationId !== null && t.conversationId !== filter.conversationId) {
        continue;
      }
      items.push(this.toPublic(t));
    }
    return items.sort((a, b) => b.startedAt - a.startedAt);
  }

  appendLog(taskId: string, chunk: string): void {
    const t = this.tasks.get(taskId);
    if (!t || t.status !== "running" || !chunk) return;
    t.console = `${t.console ?? ""}${chunk}`;
    if (t.console.length > CONSOLE_MAX_CHARS) t.console = t.console.slice(-CONSOLE_MAX_CHARS);
    if (t.logTimer) return;
    t.logTimer = setTimeout(() => {
      t.logTimer = undefined;
      this.emitChanged(t);
    }, LOG_EMIT_MS);
  }

  /** Mark finished from process exit. No-op if already cancelled. */
  finish(taskId: string, outcome: { ok: boolean; result?: unknown; error?: string; console?: string }): void {
    const t = this.tasks.get(taskId);
    if (!t) return;
    if (t.logTimer) {
      clearTimeout(t.logTimer);
      t.logTimer = undefined;
    }
    if (t.status === "cancelled") {
      this.notify(t);
      this.scheduleCleanup(taskId);
      return;
    }
    t.status = outcome.ok ? "completed" : "failed";
    t.finishedAt = Date.now();
    if (outcome.ok) t.result = outcome.result;
    else t.error = outcome.error ?? "Task failed";
    if (outcome.console) t.console = outcome.console;
    this.notify(t);
    this.emitChanged(t);
    this.scheduleCleanup(taskId);
  }

  cancel(taskId: string): BgTaskSnapshot | null {
    const t = this.tasks.get(taskId);
    if (!t) return null;
    if (t.status !== "running") return this.toPublic(t);
    if (t.logTimer) {
      clearTimeout(t.logTimer);
      t.logTimer = undefined;
    }
    try {
      t.kill();
    } catch {
      /* ignore */
    }
    t.status = "cancelled";
    t.finishedAt = Date.now();
    t.error = "Cancelled";
    this.notify(t);
    this.emitChanged(t);
    this.scheduleCleanup(taskId);
    return this.toPublic(t);
  }

  await(taskId: string, timeoutMs = DEFAULT_AWAIT_MS): Promise<BgTaskSnapshot> {
    const t = this.tasks.get(taskId);
    if (!t) {
      return Promise.resolve({
        taskId,
        toolId: "",
        toolName: "",
        status: "failed",
        startedAt: 0,
        finishedAt: Date.now(),
        error: `Task not found: ${taskId}`,
      });
    }
    if (t.status !== "running") return Promise.resolve(this.toPublic(t));

    return new Promise((resolve) => {
      const timer = setTimeout(
        () => {
          const idx = t.waiters.indexOf(onDone);
          if (idx >= 0) t.waiters.splice(idx, 1);
          resolve(this.toPublic(t));
        },
        Math.max(0, timeoutMs),
      );

      const onDone = (snap: BgTaskSnapshot) => {
        clearTimeout(timer);
        resolve(snap);
      };
      t.waiters.push(onDone);
    });
  }

  /** Test helper */
  _reset(): void {
    for (const t of this.tasks.values()) {
      try {
        if (t.status === "running") t.kill();
      } catch {
        /* ignore */
      }
    }
    this.tasks.clear();
  }

  private emitChanged(t: BgTaskInternal): void {
    wsHub.emit("bg-tasks:updated", this.toPublic(t));
  }

  private toPublic(t: BgTaskInternal): BgTaskSnapshot {
    return {
      taskId: t.taskId,
      toolId: t.toolId,
      toolName: t.toolName,
      agentId: t.agentId,
      conversationId: t.conversationId,
      status: t.status,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
      result: t.result,
      error: t.error,
      console: t.console,
      pid: t.pid,
    };
  }

  private notify(t: BgTaskInternal): void {
    const snap = this.toPublic(t);
    const waiters = t.waiters.splice(0, t.waiters.length);
    for (const w of waiters) {
      try {
        w(snap);
      } catch {
        /* ignore */
      }
    }
  }

  private scheduleCleanup(taskId: string): void {
    setTimeout(() => {
      const t = this.tasks.get(taskId);
      if (t && t.status !== "running") this.tasks.delete(taskId);
    }, COMPLETED_TTL_MS);
  }
}

export const bgTaskRegistry = new BgTaskRegistry();
export { DEFAULT_AWAIT_MS };
