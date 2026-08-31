import { createAsyncThunk } from "@reduxjs/toolkit";
import { apiClient } from "src/common/api";
import type { Agent, AgentListItem } from "src/common/types";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

// ─── State ────────────────────────────────────────────────────────────────────

export interface IAgentsState extends IBaseState {
  filter: {
    page?: number;
    limit?: number;
    sorts?: string;
    search?: string;
  };
}

const initialState: IAgentsState = {
  total: 0,
  items: [] as AgentListItem[],
  selected: [],
  filter: {},
};

function applyAgentColumnOrder(items: AgentListItem[], teamId: string | null, agentIds: string[]): AgentListItem[] {
  const order = new Map(agentIds.map((id, i) => [id, i]));
  return items.map((agent) => {
    const idx = order.get(agent.id);
    if (idx === undefined) return agent;
    return { ...agent, teamId, sortOrder: idx };
  });
}

export const reorderAgents = createAsyncThunk("agents/reorder", async ({ teamId, agentIds }: { teamId: string | null; agentIds: string[] }) => {
  await apiClient.put("/api/agents/reorder", { teamId, agentIds });
  return { teamId, agentIds };
});

// ─── Extra actions ────────────────────────────────────────────────────────────

export const cloneAgent = createAsyncThunk("agents/clone", async (id: string, { rejectWithValue }) => {
  try {
    return (await apiClient.post(`/api/agents/${id}/clone`)) as Agent;
  } catch (err: any) {
    return rejectWithValue(err?.message ?? "Failed to clone agent");
  }
});

// ─── Slice ────────────────────────────────────────────────────────────────────

const { actions: _actions, reducer: agentsReducer } = new BaseReducer<IAgentsState>({
  name: "agents",
  basePath: "/api/agents",
  initialState,
  extraActions: {
    reorderAgentsLocal(state: IAgentsState, { payload }: { payload: { teamId: string | null; agentIds: string[] } }) {
      state.items = applyAgentColumnOrder(state.items as AgentListItem[], payload.teamId, payload.agentIds);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(cloneAgent.fulfilled, (state, action) => {
      const info = action.payload as Agent;
      const index = state.items.findIndex((item) => item.id === info.id);
      if (index >= 0) {
        state.items.splice(index, 1, Object.assign(state.items[index], info));
      } else {
        state.items.unshift(info);
      }
    });
    builder.addCase(reorderAgents.fulfilled, (state, action) => {
      state.items = applyAgentColumnOrder(state.items as AgentListItem[], action.payload.teamId, action.payload.agentIds);
    });
  },
}).createSlice();

export const { fetchItems: fetchAgents, getItem: fetchOneAgent, createItem: createAgent, updateItem: updateAgent, deleteItem: deleteAgent, updateFilter: updateAgentsFilter, upsertLocal: upsertAgentLocal, removeLocal: removeAgentLocal, reorderAgentsLocal } = _actions as any;

export { agentsReducer };
export default agentsReducer;
