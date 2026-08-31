import type { Skill } from "src/common/types";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

export interface ISkillsState extends IBaseState {
  filter: { page?: number; limit?: number; sorts?: string; search?: string };
}

const initialState: ISkillsState = {
  total: 0,
  items: [] as Skill[],
  selected: [],
  filter: { limit: 100, sorts: "-updatedAt" },
};

const { actions: _actions, reducer: skillsReducer } = new BaseReducer<ISkillsState>({
  name: "skills",
  basePath: "/api/skills",
  initialState,
}).createSlice();

export const { fetchItems: fetchSkills, getItem: fetchOneSkill, createItem: createSkill, updateItem: updateSkill, deleteItem: deleteSkill, updateFilter: updateSkillsFilter, upsertLocal: upsertSkillLocal, updateLocal: updateSkillLocal, removeLocal: removeSkillLocal } = _actions as any;

export { skillsReducer };
export default skillsReducer;
