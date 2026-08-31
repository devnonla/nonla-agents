import { useCallback, useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import { wsClient } from "src/common/api/wsClient";

export type ConversationBgTask = {
  taskId: string;
  toolId: string;
  toolName: string;
  conversationId?: string | null;
  status: "running" | "completed" | "failed" | "cancelled" | "expired";
  startedAt: number;
  finishedAt?: number;
  error?: string;
  console?: string;
  result?: unknown;
};

export function parseBgTaskRef(output: unknown): { taskId: string; toolName?: string } | null {
  if (output == null) return null;
  let parsed: unknown = output;
  if (typeof output === "string") {
    try {
      parsed = JSON.parse(output);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Record<string, unknown>;
  if (rec.status !== "running" || typeof rec.taskId !== "string" || !rec.taskId) return null;
  return { taskId: rec.taskId, toolName: typeof rec.toolName === "string" ? rec.toolName : undefined };
}

export function formatBgElapsed(startedAt: number, now: number, finishedAt?: number): string {
  const end = finishedAt && finishedAt > startedAt ? finishedAt : now;
  const sec = Math.max(0, Math.floor((end - startedAt) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

type ListStore = {
  conversationId: string | null;
  tasks: ConversationBgTask[];
  cancellingIds: Set<string>;
  loaded: boolean;
};

let listStore: ListStore = { conversationId: null, tasks: [], cancellingIds: new Set(), loaded: false };
const listListeners = new Set<() => void>();
let listUnsubWs: (() => void) | null = null;
let listAttachedId: string | null | undefined;
let listRefCount = 0;

function listNotify() {
  for (const listener of listListeners) listener();
}

async function fetchList(conversationId: string) {
  try {
    const data = await apiClient.get<{ items: ConversationBgTask[] }>(`/api/conversations/${conversationId}/bg-tasks`);
    if (listAttachedId !== conversationId) return;
    listStore = {
      conversationId,
      tasks: (data.items ?? []).filter((t) => t.status === "running"),
      cancellingIds: listStore.cancellingIds,
      loaded: true,
    };
    listNotify();
  } catch {
    if (listAttachedId !== conversationId) return;
    listStore = { conversationId, tasks: [], cancellingIds: new Set(), loaded: true };
    listNotify();
  }
}

function attachList(conversationId: string | null) {
  if (listAttachedId === conversationId) return;
  listUnsubWs?.();
  listUnsubWs = null;
  listAttachedId = conversationId;
  listStore = { conversationId, tasks: [], cancellingIds: new Set(), loaded: !conversationId };
  listNotify();
  if (!conversationId) return;
  void fetchList(conversationId);
  listUnsubWs = wsClient.on<ConversationBgTask>("bg-tasks:updated", (payload) => {
    if (payload.conversationId !== conversationId) return;
    const prev = listStore.tasks;
    const next =
      payload.status !== "running"
        ? prev.filter((t) => t.taskId !== payload.taskId)
        : (() => {
            const idx = prev.findIndex((t) => t.taskId === payload.taskId);
            if (idx === -1) return [payload, ...prev];
            const copy = [...prev];
            copy[idx] = payload;
            return copy;
          })();
    listStore = { ...listStore, tasks: next };
    listNotify();
  });
}

function subscribeList(conversationId: string | null, onStoreChange: () => void) {
  listRefCount += 1;
  listListeners.add(onStoreChange);
  attachList(conversationId);
  return () => {
    listListeners.delete(onStoreChange);
    listRefCount -= 1;
    if (listRefCount === 0) {
      listUnsubWs?.();
      listUnsubWs = null;
      listAttachedId = undefined;
      listStore = { conversationId: null, tasks: [], cancellingIds: new Set(), loaded: false };
    }
  };
}

export function useConversationBgTasks(conversationId: string | null) {
  const [, setVersion] = useState(0);

  useEffect(() => {
    return subscribeList(conversationId, () => setVersion((v) => v + 1));
  }, [conversationId]);

  const matched = listStore.conversationId === conversationId;
  const tasks = matched ? listStore.tasks : [];
  const cancellingIds = matched ? listStore.cancellingIds : new Set<string>();
  const loaded = matched ? listStore.loaded : !conversationId;

  const cancel = useCallback(
    async (taskId: string) => {
      if (!conversationId) return;
      listStore = { ...listStore, cancellingIds: new Set(listStore.cancellingIds).add(taskId) };
      listNotify();
      try {
        await apiClient.post(`/api/conversations/${conversationId}/bg-tasks/${taskId}/cancel`, {});
        if (listAttachedId === conversationId) {
          const nextCancelling = new Set(listStore.cancellingIds);
          nextCancelling.delete(taskId);
          listStore = {
            ...listStore,
            tasks: listStore.tasks.filter((t) => t.taskId !== taskId),
            cancellingIds: nextCancelling,
          };
          listNotify();
        }
      } catch {
        if (listAttachedId === conversationId) {
          const nextCancelling = new Set(listStore.cancellingIds);
          nextCancelling.delete(taskId);
          listStore = { ...listStore, cancellingIds: nextCancelling };
          listNotify();
        }
      }
    },
    [conversationId],
  );

  const cancelAll = useCallback(async () => {
    await Promise.all(tasks.map((t) => cancel(t.taskId)));
  }, [cancel, tasks]);

  return { tasks, cancellingIds, loaded, cancel, cancelAll };
}

export function useConversationBgTask(conversationId: string | null, taskId: string | null, fetchDetail = false) {
  const [task, setTask] = useState<ConversationBgTask | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!conversationId || !taskId || !fetchDetail) return;
    let cancelled = false;
    void apiClient
      .get<ConversationBgTask>(`/api/conversations/${conversationId}/bg-tasks/${taskId}`)
      .then((data) => {
        if (!cancelled) setTask(data);
      })
      .catch(() => {
        if (!cancelled) setTask({ taskId, toolId: "", toolName: "", status: "expired", startedAt: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, taskId, fetchDetail]);

  useEffect(() => {
    if (!conversationId || !taskId || !fetchDetail) return;
    return wsClient.on<ConversationBgTask>("bg-tasks:updated", (payload) => {
      if (payload.taskId !== taskId) return;
      if (payload.conversationId && payload.conversationId !== conversationId) return;
      setTask(payload);
    });
  }, [conversationId, taskId, fetchDetail]);

  const cancel = useCallback(async () => {
    if (!conversationId || !taskId) return;
    setCancelling(true);
    try {
      const data = await apiClient.post<ConversationBgTask>(`/api/conversations/${conversationId}/bg-tasks/${taskId}/cancel`, {});
      setTask(data);
    } finally {
      setCancelling(false);
    }
  }, [conversationId, taskId]);

  return { task, cancelling, cancel };
}
