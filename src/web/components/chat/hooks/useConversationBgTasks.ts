import type { ChatBgTask } from "devnonla-ui";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import { wsClient } from "src/common/api/wsClient";

type ConversationBgTask = ChatBgTask;

type ListStore = {
  conversationId: string | null;
  tasks: ConversationBgTask[];
  cancellingIds: Set<string>;
};

let listStore: ListStore = { conversationId: null, tasks: [], cancellingIds: new Set() };
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
    };
    listNotify();
  } catch {
    if (listAttachedId !== conversationId) return;
    listStore = { conversationId, tasks: [], cancellingIds: new Set() };
    listNotify();
  }
}

function attachList(conversationId: string | null) {
  if (listAttachedId === conversationId) return;
  listUnsubWs?.();
  listUnsubWs = null;
  listAttachedId = conversationId;
  listStore = { conversationId, tasks: [], cancellingIds: new Set() };
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
      listStore = { conversationId: null, tasks: [], cancellingIds: new Set() };
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

  return { tasks, cancellingIds, cancel };
}
