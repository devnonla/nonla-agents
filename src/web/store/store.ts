import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";

import { authReducer } from "src/common/authSlice";
import { agentsReducer } from "src/modules/agents/common/agentsSlice";
import { chatReducer } from "src/modules/agents/common/chatSlice";
import { teamsReducer } from "src/modules/agents/common/teamsSlice";
import { datatableProjectsReducer } from "src/modules/datatables/common/datatableProjectsSlice";
import { jobsReducer } from "src/modules/jobs/common/jobsSlice";
import { kvStoreReducer } from "src/modules/kvstore/common/kvStoreSlice";
import { llmProvidersReducer } from "src/modules/llm-providers/common/llmProvidersSlice";
import { mcpServersReducer } from "src/modules/mcp-servers/common/mcpServersSlice";
import { myMcpServersReducer } from "src/modules/my-mcp-servers/common/myMcpServersSlice";
import { secretsReducer } from "src/modules/secrets/common/secretsSlice";
import { sitesReducer } from "src/modules/sites/common/sitesSlice";
import { skillsReducer } from "src/modules/skills/common/skillsSlice";
import { toolFoldersReducer } from "src/modules/tools/common/toolFoldersSlice";
import { toolsReducer } from "src/modules/tools/common/toolsSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    llmProviders: llmProvidersReducer,
    agents: agentsReducer,
    tools: toolsReducer,
    toolFolders: toolFoldersReducer,
    skills: skillsReducer,
    teams: teamsReducer,
    chat: chatReducer,
    mcpServers: mcpServersReducer,
    myMcpServers: myMcpServersReducer,
    kvStore: kvStoreReducer,
    secrets: secretsReducer,
    sites: sitesReducer,
    jobs: jobsReducer,
    datatableProjects: datatableProjectsReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// ─── Typed hooks — dùng thay cho useDispatch/useSelector thông thường ─────────
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = <T>(selector: (state: RootState) => T): T => useSelector(selector);
