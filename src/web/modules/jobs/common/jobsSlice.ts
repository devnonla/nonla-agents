import type { Job } from "src/common/types";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

export interface IJobsState extends IBaseState {
  filter: { page?: number; limit?: number; sorts?: string; search?: string };
}

const initialState: IJobsState = {
  total: 0,
  items: [] as Job[],
  selected: [],
  filter: { limit: 100, sorts: "-updatedAt" },
};

const { actions: _actions, reducer: jobsReducer } = new BaseReducer<IJobsState>({
  name: "jobs",
  basePath: "/api/jobs",
  initialState,
}).createSlice();

export const { fetchItems: fetchJobs, getItem: fetchOneJob, createItem: createJob, updateItem: updateJob, deleteItem: deleteJob, updateFilter: updateJobsFilter, upsertLocal: upsertJobLocal, updateLocal: updateJobLocal, removeLocal: removeJobLocal } = _actions as any;

export { jobsReducer };
export default jobsReducer;
