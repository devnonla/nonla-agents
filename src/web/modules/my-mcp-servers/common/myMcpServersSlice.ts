import type { MyMcpServer } from "src/common/types";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

export function toMyMcpServerListItem(row: MyMcpServer): MyMcpServer {
  const { key: _key, tools: _tools, ...rest } = row;
  return rest;
}

export interface IMyMcpServersState extends IBaseState {
  filter: { page?: number; limit?: number; sorts?: string; search?: string };
}

const initialState: IMyMcpServersState = {
  total: 0,
  items: [] as MyMcpServer[],
  selected: [],
  filter: {},
};

const { actions: _actions, reducer: myMcpServersReducer } = new BaseReducer<IMyMcpServersState>({
  name: "myMcpServers",
  basePath: "/api/my-mcp-servers",
  initialState,
}).createSlice();

export const { fetchItems: fetchMyMcpServers, getItem: fetchOneMyMcpServer, createItem: createMyMcpServer, updateItem: updateMyMcpServer, deleteItem: deleteMyMcpServer, updateFilter: updateMyMcpServersFilter, upsertLocal: upsertMyMcpServerLocal, removeLocal: removeMyMcpServerLocal } = _actions as any;

export { myMcpServersReducer };
export default myMcpServersReducer;
