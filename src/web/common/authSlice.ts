/**
 * Auth slice — stores current authenticated user info.
 * Fetches /api/auth/me on app init to populate user data (including role).
 */

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { apiClient } from "src/common/api";
import type { User } from "src/common/types";

// ─── State ────────────────────────────────────────────────────────────────────

export interface IAuthState {
  user: User | null;
  loaded: boolean;
}

const initialState: IAuthState = {
  user: null,
  loaded: false,
};

// ─── Thunks ───────────────────────────────────────────────────────────────────

export const fetchCurrentUser = createAsyncThunk("auth/fetchCurrentUser", async () => {
  const user = await apiClient.get<User>("/api/auth/me");
  return user;
});

// ─── Slice ────────────────────────────────────────────────────────────────────

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearCurrentUser(state) {
      state.user = null;
      state.loaded = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.loaded = true;
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.user = null;
        state.loaded = true;
      });
  },
});

export const { clearCurrentUser } = authSlice.actions;
export const authReducer = authSlice.reducer;
export default authReducer;
