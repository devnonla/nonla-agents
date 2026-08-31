import { type ActionReducerMapBuilder, createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { apiClient } from "../common/api";
import { cleanObject, getValueByPath } from "../common/utils/objectUtils";

export interface IBaseState {
  total: number;
  items: any[];
  filter: {
    page?: number;
    limit?: number;
    sorts?: string;
    search?: string;
    createdAt?: string;
    [key: string]: any;
  };
  selected?: string[];
  meta?: Record<string, any>;
}

export interface BaseReducerConfig<T extends IBaseState> {
  name: string;
  basePath: string;
  initialState: T;
  extraReducers?: (builder: ActionReducerMapBuilder<T>) => void;
  extraActions?: Record<string, any>;
}

export interface BaseActions {
  fetchItems: any;
  getItem: any;
  createItem: any;
  updateItem: any;
  deleteItem: any;
}

export class BaseReducer<T extends IBaseState> {
  name: string;

  basePath: string;

  initialState: T;

  extraReducers?: (builder: ActionReducerMapBuilder<T>) => void;

  extraActions?: Record<string, any>;

  constructor(config: BaseReducerConfig<T>) {
    this.name = config.name;
    this.basePath = config.basePath;
    this.initialState = config.initialState;
    this.extraReducers = config.extraReducers;
    this.extraActions = config.extraActions;
  }

  // Create base actions
  createBaseActions(): BaseActions {
    const fetchItems = createAsyncThunk(`${this.name}/list`, async (payload: Record<string, any>, { getState, rejectWithValue }) => {
      const state = getState() as any;
      const currentState = getValueByPath(state, this.name);

      try {
        const params = cleanObject({
          ...currentState.filter,
          ...(payload || {}),
        });

        return await apiClient.get(this.basePath, params);
      } catch (error: any) {
        return rejectWithValue(error?.message ?? "Failed to fetch items");
      }
    });

    const getItem = createAsyncThunk(`${this.name}/get`, async (id: string, { rejectWithValue }) => {
      try {
        const rs: any = await apiClient.get(`${this.basePath}/${id}`);
        return { id: rs.id, ...rs };
      } catch (error: any) {
        return rejectWithValue(error?.message ?? "Failed to get item");
      }
    });

    const createItem = createAsyncThunk(`${this.name}/create`, async (payload: Record<string, any>, { rejectWithValue }) => {
      try {
        const rs: any = await apiClient.post(this.basePath, payload);
        return rs;
      } catch (error: any) {
        return rejectWithValue(error?.message ?? "Failed to create item");
      }
    });

    const updateItem = createAsyncThunk(`${this.name}/update`, async (payload: { id: string; [key: string]: any }, { rejectWithValue }) => {
      try {
        const { id, ...updateInfo } = payload;
        const rs: any = await apiClient.put(`${this.basePath}/${id}`, updateInfo);
        return { id, ...rs };
      } catch (error: any) {
        return rejectWithValue(error?.message ?? "Failed to update item");
      }
    });

    const deleteItem = createAsyncThunk(`${this.name}/delete`, async (id: string, { rejectWithValue }) => {
      try {
        await apiClient.delete(`${this.basePath}/${id}`);
        return { id };
      } catch (error: any) {
        return rejectWithValue(error?.message ?? "Failed to delete item");
      }
    });

    return {
      fetchItems,
      getItem,
      createItem,
      updateItem,
      deleteItem,
    };
  }

  // Create slice with common reducers
  createSlice() {
    const actions = this.createBaseActions();

    const slice = createSlice({
      name: this.name,
      initialState: this.initialState,
      reducers: {
        reset: (state) => {
          state.total = this.initialState.total;
          state.items = this.initialState.items;
          state.filter = JSON.parse(JSON.stringify(this.initialState.filter));
        },

        updateFilter(state, { payload }) {
          // Merge payload with existing filter, but remove keys that are explicitly set to undefined
          const mergedFilter = { ...state.filter };
          for (const key of Object.keys(payload)) {
            if (payload[key] === undefined) {
              delete mergedFilter[key];
            } else {
              mergedFilter[key] = payload[key];
            }
          }
          state.filter = mergedFilter;
        },

        updateSelected(state: any, { payload }) {
          if (state.selected) {
            state.selected = payload;
          }
        },

        upsertLocal(state, { payload }) {
          const index = state.items.findIndex((item) => item.id === payload.id);
          if (index >= 0) {
            state.items.splice(index, 1, Object.assign(state.items[index], payload));
          } else {
            state.items.push(payload);
          }
        },

        updateLocal(state, { payload }) {
          const index = state.items.findIndex((item) => item.id === payload.id);
          if (index >= 0) {
            state.items.splice(index, 1, Object.assign(state.items[index], payload));
          }
        },

        removeLocal(state, { payload }: { payload: string }) {
          const index = state.items.findIndex((item) => item.id === payload);
          if (index >= 0) {
            state.items.splice(index, 1);
          }
        },

        // Thêm extraActions vào reducers
        ...(this.extraActions ?? {}),
      },
      extraReducers: (builder) => {
        // Base cases
        builder
          .addCase(actions.fetchItems.fulfilled, (state, action) => {
            const { total, items, meta } = action.payload as any;
            state.items = items;
            state.total = total;
            if (meta) {
              state.meta = meta;
            }
          })
          .addCase(actions.createItem.fulfilled, (state, action) => {
            const info = action.payload;
            const index = state.items.findIndex((item) => item.id === info.id);

            if (index >= 0) {
              const newObject = Object.assign(state.items[index], info);
              state.items.splice(index, 1, newObject);
            } else {
              if (state?.filter?.sorts === "-createdAt") {
                state.items.unshift(info);
                return;
              }

              state.items.push(info);
            }
          })
          .addCase(actions.updateItem.fulfilled, (state, action) => {
            const info = action.payload;
            const index = state.items.findIndex((item) => item.id === info.id);

            if (index >= 0) {
              const newObject = Object.assign(state.items[index], info);
              state.items.splice(index, 1, newObject);
            }
          })
          .addCase(actions.deleteItem.fulfilled, (state, action) => {
            const { id } = action.payload;
            const index = state.items.findIndex((item) => item.id === id);

            if (index >= 0) {
              state.items.splice(index, 1);
            }
          });

        // Extra cases
        if (this.extraReducers) {
          this.extraReducers(builder);
        }
      },
    });

    return {
      reducer: slice.reducer,
      actions: {
        ...slice.actions,
        ...actions,
      },
    };
  }
}
