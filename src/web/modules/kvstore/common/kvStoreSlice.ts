import type { KvStoreEntry } from "src/common/types";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

export interface IKvStoreState extends IBaseState {
  filter: { page: number; limit: number; sorts?: string; search?: string };
}

const initialState: IKvStoreState = {
  total: 0,
  items: [] as KvStoreEntry[],
  selected: [],
  filter: { page: 1, limit: 50, sorts: "key" },
};

const { actions: _actions, reducer: kvStoreReducer } = new BaseReducer<IKvStoreState>({
  name: "kvStore",
  basePath: "/api/kvstore",
  initialState,
}).createSlice();

export const { fetchItems: fetchKvStore, getItem: fetchOneKvEntry, createItem: createKvEntry, updateItem: updateKvEntry, deleteItem: deleteKvEntry, updateFilter: updateKvStoreFilter, upsertLocal: upsertKvEntryLocal, removeLocal: removeKvEntryLocal } = _actions as any;

export { kvStoreReducer };
export default kvStoreReducer;
