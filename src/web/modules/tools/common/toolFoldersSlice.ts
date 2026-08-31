import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { apiClient } from "src/common/api";
import type { ToolFolder } from "src/common/types";

export interface ToolFolderWithTools extends ToolFolder {
  toolIds: string[];
}

export interface IToolFoldersState {
  folders: ToolFolderWithTools[];
  loading: boolean;
}

const initialState: IToolFoldersState = {
  folders: [],
  loading: false,
};

function applyFolderOrder(folders: ToolFolderWithTools[], folderIds: string[]): ToolFolderWithTools[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const ordered: ToolFolderWithTools[] = [];
  for (let i = 0; i < folderIds.length; i++) {
    const folder = byId.get(folderIds[i]);
    if (!folder) continue;
    ordered.push({ ...folder, sortOrder: i });
    byId.delete(folderIds[i]);
  }
  for (const leftover of byId.values()) {
    ordered.push(leftover);
  }
  return ordered;
}

export const fetchToolFolders = createAsyncThunk("toolFolders/fetch", async () => {
  const res = await apiClient.get<{ items: ToolFolderWithTools[]; total: number }>("/api/tool-folders");
  return res.items;
});

export const createToolFolder = createAsyncThunk("toolFolders/create", async (data: { name: string; description?: string }) => {
  return await apiClient.post<ToolFolderWithTools>("/api/tool-folders", data);
});

export const updateToolFolder = createAsyncThunk("toolFolders/update", async ({ id, ...data }: { id: string } & Partial<Pick<ToolFolder, "name" | "description">>) => {
  await apiClient.put(`/api/tool-folders/${id}`, data);
  return { id, ...data };
});

export const reorderToolFolders = createAsyncThunk("toolFolders/reorder", async (folderIds: string[]) => {
  await apiClient.put("/api/tool-folders/reorder", { folderIds });
  return folderIds;
});

export const deleteToolFolder = createAsyncThunk("toolFolders/delete", async (id: string) => {
  await apiClient.delete(`/api/tool-folders/${id}`);
  return id;
});

const toolFoldersSlice = createSlice({
  name: "toolFolders",
  initialState,
  reducers: {
    upsertToolFolderLocal(state, { payload }: { payload: ToolFolderWithTools }) {
      const idx = state.folders.findIndex((f) => f.id === payload.id);
      if (idx >= 0) {
        state.folders[idx] = { ...state.folders[idx], ...payload };
      } else {
        state.folders.push(payload);
      }
    },
    removeToolFolderLocal(state, { payload }: { payload: string }) {
      state.folders = state.folders.filter((f) => f.id !== payload);
    },
    reorderToolFoldersLocal(state, { payload }: { payload: string[] }) {
      state.folders = applyFolderOrder(state.folders, payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchToolFolders.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchToolFolders.fulfilled, (state, action) => {
        state.folders = action.payload;
        state.loading = false;
      })
      .addCase(fetchToolFolders.rejected, (state) => {
        state.loading = false;
      })
      .addCase(createToolFolder.fulfilled, (state, action) => {
        if (!state.folders.some((f) => f.id === action.payload.id)) {
          state.folders.push(action.payload);
        }
      })
      .addCase(updateToolFolder.fulfilled, (state, action) => {
        const { id, ...data } = action.payload;
        const idx = state.folders.findIndex((f) => f.id === id);
        if (idx >= 0) {
          state.folders[idx] = { ...state.folders[idx], ...data };
        }
      })
      .addCase(reorderToolFolders.fulfilled, (state, action) => {
        state.folders = applyFolderOrder(state.folders, action.payload);
      })
      .addCase(deleteToolFolder.fulfilled, (state, action) => {
        state.folders = state.folders.filter((f) => f.id !== action.payload);
      });
  },
});

export const { upsertToolFolderLocal, removeToolFolderLocal, reorderToolFoldersLocal } = toolFoldersSlice.actions;
export const toolFoldersReducer = toolFoldersSlice.reducer;
export default toolFoldersReducer;
