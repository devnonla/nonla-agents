import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { apiClient } from "src/common/api";
import type { AgentConversation, AgentMessage, NewAgentMessage } from "src/common/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedMessage extends AgentMessage {
  convTitle: string;
  convTrigger: AgentConversation["trigger"];
  convCreatedAt: Date | null;
}

export interface IChatState {
  conversations: AgentConversation[];
  activeConversationId: string | null;
  loading: boolean;
}

const initialState: IChatState = {
  conversations: [],
  activeConversationId: null,
  loading: false,
};

// ─── Thunks ───────────────────────────────────────────────────────────────────

export const fetchConversations = createAsyncThunk("chat/fetchConversations", async (agentId: string) => {
  const result = await apiClient.get<{ items: AgentConversation[] }>(`/api/conversations${agentId ? `?agentId=${agentId}` : ""}`);
  return result.items;
});

export const createConversation = createAsyncThunk(
  "chat/createConversation",
  async (data: {
    agentId: string;
    title?: string;
    trigger?: "manual" | "cron" | "api" | "meeting" | "public";
  }) => {
    const conv = await apiClient.post<AgentConversation>("/api/conversations", {
      agentId: data.agentId,
      title: data.title ?? "New Chat",
      trigger: data.trigger ?? "manual",
    });
    return conv;
  },
);

export const updateConversation = createAsyncThunk("chat/updateConversation", async ({ id, ...data }: { id: string } & Partial<Pick<AgentConversation, "title" | "status" | "finishedAt" | "errorMessage">>) => {
  await apiClient.put(`/api/conversations/${id}`, data);
  return { id, ...data };
});

export const deleteConversation = createAsyncThunk("chat/deleteConversation", async (id: string) => {
  await apiClient.delete(`/api/conversations/${id}`);
  return id;
});

export const saveMessage = createAsyncThunk(
  "chat/saveMessage",
  async (
    data: Omit<NewAgentMessage, "id" | "conversationId"> & {
      conversationId?: string;
    },
    { getState },
  ) => {
    const state = getState() as { chat: IChatState };
    const convId = data.conversationId ?? state.chat.activeConversationId ?? undefined;
    if (!convId) throw new Error("No active conversation");
    const msg = await apiClient.post<AgentMessage>(`/api/conversations/${convId}/messages`, {
      ...data,
      conversationId: convId,
    });
    return msg;
  },
);

export const updateMessageMetadata = createAsyncThunk("chat/updateMessageMetadata", async ({ conversationId, id, patch }: { conversationId: string; id: string; patch: Record<string, unknown> }) => {
  await apiClient.patch(`/api/conversations/${conversationId}/messages/${id}/metadata`, patch);
});

export const loadAgentFeed = createAsyncThunk("chat/loadAgentFeed", async ({ agentId, cursor }: { agentId: string; cursor?: Date }) => {
  const result = await apiClient.get<{ items: FeedMessage[]; hasMore: boolean }>(`/api/conversations/feed/messages?agentId=${agentId}${cursor ? `&cursor=${cursor.toISOString()}` : ""}`);
  return result;
});

// ─── Slice ────────────────────────────────────────────────────────────────────

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setActiveConversationId(state, { payload }: { payload: string | null }) {
      state.activeConversationId = payload;
    },
    markConversationDone(state, { payload }: { payload: string }) {
      const now = new Date();
      const conv = state.conversations.find((c) => c.id === payload);
      if (conv) {
        conv.status = "done";
        conv.finishedAt = now as any;
      }
    },
    upsertConversationLocal(state, { payload }: { payload: AgentConversation }) {
      const idx = state.conversations.findIndex((c) => c.id === payload.id);
      if (idx >= 0) {
        state.conversations[idx] = {
          ...state.conversations[idx],
          ...payload,
        };
      } else {
        state.conversations.unshift(payload);
      }
    },
    removeConversationLocal(state, { payload }: { payload: string }) {
      state.conversations = state.conversations.filter((c) => c.id !== payload);
      if (state.activeConversationId === payload) {
        state.activeConversationId = state.conversations[0]?.id ?? null;
      }
    },
    resetConversations(state) {
      state.conversations = [];
      state.activeConversationId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchConversations
      .addCase(fetchConversations.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        // Preserve local "running" when a stale fetch races with a newer WS update
        const localById = new Map(state.conversations.map((c) => [c.id, c]));
        state.conversations = action.payload.map((incoming) => {
          const local = localById.get(incoming.id);
          if (local?.status === "running" && incoming.status !== "running") {
            const localStart = local.startedAt ? new Date(local.startedAt as Date | string).getTime() : 0;
            const incomingStart = incoming.startedAt ? new Date(incoming.startedAt as Date | string).getTime() : 0;
            if (localStart >= incomingStart) {
              return { ...incoming, status: "running" as const, startedAt: local.startedAt, finishedAt: null };
            }
          }
          return incoming;
        });
        state.loading = false;
      })
      .addCase(fetchConversations.rejected, (state) => {
        state.loading = false;
      })
      // createConversation
      .addCase(createConversation.fulfilled, (state, action) => {
        // Guard against duplicates: WS `conversations:created` may have already inserted this
        if (!state.conversations.some((c) => c.id === action.payload.id)) {
          state.conversations.unshift(action.payload);
        }
      })
      // updateConversation
      .addCase(updateConversation.fulfilled, (state, action) => {
        const { id, ...data } = action.payload;
        const conv = state.conversations.find((c) => c.id === id);
        if (conv) Object.assign(conv, data);
      })
      // deleteConversation
      .addCase(deleteConversation.fulfilled, (state, action) => {
        const id = action.payload;
        state.conversations = state.conversations.filter((c) => c.id !== id);
        if (state.activeConversationId === id) {
          state.activeConversationId = state.conversations[0]?.id ?? null;
        }
      });
  },
});

export const { setActiveConversationId, markConversationDone, upsertConversationLocal, removeConversationLocal, resetConversations } = chatSlice.actions;

export const chatReducer = chatSlice.reducer;
export default chatReducer;
