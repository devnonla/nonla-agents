import { type PayloadAction, createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { DatatableProject } from "src/common/types";
import { datatablesApi } from "./datatablesApi";

export type DatatableProjectListItem = DatatableProject & { tableCount: number; tableNames: string[] };

interface IDatatableProjectsState {
  total: number;
  items: DatatableProjectListItem[];
}

const initialState: IDatatableProjectsState = {
  total: 0,
  items: [],
};

export const fetchDatatableProjects = createAsyncThunk("datatableProjects/list", async (_, { rejectWithValue }) => {
  try {
    return await datatablesApi.listProjects();
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : "Failed to fetch projects");
  }
});

export const createDatatableProject = createAsyncThunk("datatableProjects/create", async (name: string, { rejectWithValue }) => {
  try {
    return await datatablesApi.createProject(name);
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : "Failed to create project");
  }
});

export const updateDatatableProject = createAsyncThunk("datatableProjects/update", async ({ id, name }: { id: string; name: string }, { rejectWithValue }) => {
  try {
    return await datatablesApi.updateProject(id, name);
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : "Failed to update project");
  }
});

export const deleteDatatableProject = createAsyncThunk("datatableProjects/delete", async (id: string, { rejectWithValue }) => {
  try {
    await datatablesApi.deleteProject(id);
    return { id };
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : "Failed to delete project");
  }
});

const datatableProjectsSlice = createSlice({
  name: "datatableProjects",
  initialState,
  reducers: {
    upsertLocal(state, { payload }: PayloadAction<DatatableProjectListItem>) {
      const index = state.items.findIndex((item) => item.id === payload.id);
      if (index >= 0) {
        state.items[index] = { ...state.items[index], ...payload };
      } else {
        state.items.push(payload);
        state.total = state.items.length;
      }
    },
    removeLocal(state, { payload }: PayloadAction<string>) {
      state.items = state.items.filter((item) => item.id !== payload);
      state.total = state.items.length;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDatatableProjects.fulfilled, (state, action) => {
        state.items = action.payload;
        state.total = action.payload.length;
      })
      .addCase(createDatatableProject.fulfilled, (state, action) => {
        const entry: DatatableProjectListItem = { ...action.payload, tableCount: 0, tableNames: [] };
        if (!state.items.some((item) => item.id === entry.id)) {
          state.items.push(entry);
          state.total = state.items.length;
        }
      })
      .addCase(updateDatatableProject.fulfilled, (state, action) => {
        const index = state.items.findIndex((item) => item.id === action.payload.id);
        if (index >= 0) {
          state.items[index] = { ...state.items[index], ...action.payload };
        }
      })
      .addCase(deleteDatatableProject.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload.id);
        state.total = state.items.length;
      });
  },
});

export const { upsertLocal: upsertDatatableProjectLocal, removeLocal: removeDatatableProjectLocal } = datatableProjectsSlice.actions;
export const datatableProjectsReducer = datatableProjectsSlice.reducer;
export default datatableProjectsReducer;
