import type { Site } from "src/common/types";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

export interface ISitesState extends IBaseState {
  filter: { page?: number; limit?: number; sorts?: string; search?: string };
}

const initialState: ISitesState = {
  total: 0,
  items: [] as Site[],
  selected: [],
  filter: { limit: 100, sorts: "-updatedAt" },
};

const { actions: _actions, reducer: sitesReducer } = new BaseReducer<ISitesState>({
  name: "sites",
  basePath: "/api/sites",
  initialState,
}).createSlice();

export const { fetchItems: fetchSites, getItem: fetchOneSite, createItem: createSite, updateItem: updateSite, deleteItem: deleteSite, updateFilter: updateSitesFilter, upsertLocal: upsertSiteLocal, updateLocal: updateSiteLocal, removeLocal: removeSiteLocal } = _actions as any;

export { sitesReducer };
export default sitesReducer;
