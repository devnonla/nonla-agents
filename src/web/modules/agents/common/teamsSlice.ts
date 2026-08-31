import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { apiClient } from "src/common/api";
import type { AgentTeam, AgentTeamMember } from "src/common/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamWithMembers extends AgentTeam {
  members: AgentTeamMember[];
}

export interface ITeamsState {
  teams: TeamWithMembers[];
  loading: boolean;
}

const initialState: ITeamsState = {
  teams: [],
  loading: false,
};

// ─── Thunks ───────────────────────────────────────────────────────────────────

export const fetchTeams = createAsyncThunk("teams/fetch", async () => {
  const res = await apiClient.get<{ items: TeamWithMembers[]; total: number }>("/api/teams");
  return res.items;
});

export const createTeam = createAsyncThunk("teams/create", async (data: { name: string; description?: string }) => {
  const team = await apiClient.post<TeamWithMembers>("/api/teams", data);
  return team;
});

export const updateTeam = createAsyncThunk("teams/update", async ({ id, ...data }: { id: string } & Partial<Pick<AgentTeam, "name" | "description">>) => {
  await apiClient.put(`/api/teams/${id}`, data);
  return { id, ...data };
});

export const deleteTeam = createAsyncThunk("teams/delete", async (id: string) => {
  await apiClient.delete(`/api/teams/${id}`);
  return id;
});

// ─── Slice ────────────────────────────────────────────────────────────────────

const teamsSlice = createSlice({
  name: "teams",
  initialState,
  reducers: {
    upsertTeamLocal(state, { payload }: { payload: TeamWithMembers }) {
      const idx = state.teams.findIndex((t) => t.id === payload.id);
      if (idx >= 0) {
        state.teams[idx] = { ...state.teams[idx], ...payload };
      } else {
        state.teams.push(payload);
      }
    },
    removeTeamLocal(state, { payload }: { payload: string }) {
      state.teams = state.teams.filter((t) => t.id !== payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTeams.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchTeams.fulfilled, (state, action) => {
        state.teams = action.payload;
        state.loading = false;
      })
      .addCase(fetchTeams.rejected, (state) => {
        state.loading = false;
      })
      .addCase(createTeam.fulfilled, (state, action) => {
        // Guard against duplicate from WS event
        if (!state.teams.some((t) => t.id === action.payload.id)) {
          state.teams.push(action.payload);
        }
      })
      .addCase(updateTeam.fulfilled, (state, action) => {
        const { id, ...data } = action.payload;
        const idx = state.teams.findIndex((t) => t.id === id);
        if (idx >= 0) {
          state.teams[idx] = { ...state.teams[idx], ...data };
        }
      })
      .addCase(deleteTeam.fulfilled, (state, action) => {
        state.teams = state.teams.filter((t) => t.id !== action.payload);
      });
  },
});

export const { upsertTeamLocal, removeTeamLocal } = teamsSlice.actions;
export const teamsReducer = teamsSlice.reducer;
export default teamsReducer;
