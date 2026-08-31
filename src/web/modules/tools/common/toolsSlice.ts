import { createAsyncThunk } from "@reduxjs/toolkit";
import { apiClient } from "src/common/api";
import type { AgentTool } from "src/common/types";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolEditTarget = AgentTool | null | "new";

export function toolEditKey(target: ToolEditTarget): string {
  if (target === null) return "";
  if (target === "new") return "new";
  return target.id;
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface IToolsState extends IBaseState {
  filter: { page?: number; limit?: number; sorts?: string; search?: string };
}

const initialState: IToolsState = {
  total: 0,
  items: [] as AgentTool[],
  selected: [],
  filter: {},
};

function applyToolColumnOrder(items: AgentTool[], folderId: string | null, toolIds: string[]): AgentTool[] {
  const order = new Map(toolIds.map((id, i) => [id, i]));
  return items.map((tool) => {
    const idx = order.get(tool.id);
    if (idx === undefined) return tool;
    return { ...tool, folderId, sortOrder: idx };
  });
}

export const reorderTools = createAsyncThunk("tools/reorder", async ({ folderId, toolIds }: { folderId: string | null; toolIds: string[] }) => {
  await apiClient.put("/api/tools/reorder", { folderId, toolIds });
  return { folderId, toolIds };
});

// ─── Slice ────────────────────────────────────────────────────────────────────

const { actions: _actions, reducer: toolsReducer } = new BaseReducer<IToolsState>({
  name: "tools",
  basePath: "/api/tools",
  initialState,
  extraActions: {
    reorderToolsLocal(state: IToolsState, { payload }: { payload: { folderId: string | null; toolIds: string[] } }) {
      state.items = applyToolColumnOrder(state.items as AgentTool[], payload.folderId, payload.toolIds);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(reorderTools.fulfilled, (state, action) => {
      state.items = applyToolColumnOrder(state.items as AgentTool[], action.payload.folderId, action.payload.toolIds);
    });
  },
}).createSlice();

export const { fetchItems: fetchTools, createItem: createTool, updateItem: updateTool, deleteItem: deleteTool, updateFilter: updateToolsFilter, upsertLocal: upsertToolLocal, removeLocal: removeToolLocal, reorderToolsLocal } = _actions as any;

export { toolsReducer };
export default toolsReducer;
