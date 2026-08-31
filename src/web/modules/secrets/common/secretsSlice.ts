import type { SecretEntry } from "src/common/types";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

export interface ISecretsState extends IBaseState {
  filter: { page: number; limit: number; sorts?: string; search?: string };
}

const initialState: ISecretsState = {
  total: 0,
  items: [] as SecretEntry[],
  selected: [],
  filter: { page: 1, limit: 50, sorts: "key" },
};

const { actions: _actions, reducer: secretsReducer } = new BaseReducer<ISecretsState>({
  name: "secrets",
  basePath: "/api/secrets",
  initialState,
}).createSlice();

export const { fetchItems: fetchSecrets, getItem: fetchOneSecret, createItem: createSecret, updateItem: updateSecret, deleteItem: deleteSecret, updateFilter: updateSecretsFilter, upsertLocal: upsertSecretLocal, removeLocal: removeSecretLocal } = _actions as any;

export { secretsReducer };
export default secretsReducer;
