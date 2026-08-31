import type { McpServer } from "src/common/types";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

// ─── State ────────────────────────────────────────────────────────────────────

export interface IMcpServersState extends IBaseState {
  filter: { page?: number; limit?: number; sorts?: string; search?: string };
}

const initialState: IMcpServersState = {
  total: 0,
  items: [] as McpServer[],
  selected: [],
  filter: {},
};

// ─── Slice ────────────────────────────────────────────────────────────────────

const { actions: _actions, reducer: mcpServersReducer } = new BaseReducer<IMcpServersState>({
  name: "mcpServers",
  basePath: "/api/mcp-servers",
  initialState,
}).createSlice();

export const { fetchItems: fetchMcpServers, getItem: fetchOneMcpServer, createItem: createMcpServer, updateItem: updateMcpServer, deleteItem: deleteMcpServer, updateFilter: updateMcpServersFilter, upsertLocal: upsertMcpServerLocal, removeLocal: removeMcpServerLocal } = _actions as any;

export { mcpServersReducer };
export default mcpServersReducer;
