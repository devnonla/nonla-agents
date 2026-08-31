/**
 * useSocket — mounts the WebSocket connection and wires up store updates.
 *
 * Call from AppContent with `enabled` only for authenticated app routes
 * (not login/setup/public chat). Guests on /chat must never receive CRUD WS events.
 */

import { useEffect } from "react";
import { getAuthToken } from "src/common/api";
import type { Agent, AgentConversation, AgentTool, KvStoreEntry, McpServer, MyMcpServer, SecretEntry, Skill } from "src/common/types";
import { removeAgentLocal, reorderAgentsLocal, upsertAgentLocal } from "src/modules/agents/common/agentsSlice";
import { removeConversationLocal, upsertConversationLocal } from "src/modules/agents/common/chatSlice";
import { removeTeamLocal, upsertTeamLocal } from "src/modules/agents/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { removeKvEntryLocal, upsertKvEntryLocal } from "src/modules/kvstore/common/kvStoreSlice";
import { removeMcpServerLocal, upsertMcpServerLocal } from "src/modules/mcp-servers/common/mcpServersSlice";
import { removeMyMcpServerLocal, upsertMyMcpServerLocal } from "src/modules/my-mcp-servers/common/myMcpServersSlice";
import { removeSecretLocal, upsertSecretLocal } from "src/modules/secrets/common/secretsSlice";
import { removeSkillLocal, upsertSkillLocal } from "src/modules/skills/common/skillsSlice";
import { removeToolFolderLocal, reorderToolFoldersLocal, upsertToolFolderLocal } from "src/modules/tools/common/toolFoldersSlice";
import type { ToolFolderWithTools } from "src/modules/tools/common/toolFoldersSlice";
import { removeToolLocal, reorderToolsLocal, upsertToolLocal } from "src/modules/tools/common/toolsSlice";
import { store } from "src/store/store";
import { wsClient } from "../api/wsClient";
import type { WsEvent } from "../api/wsClient";

function handleEvent(event: WsEvent) {
  const { type, payload } = event;

  switch (type) {
    // ── Agents ──────────────────────────────────────────────────────────────
    case "agents:created":
    case "agents:updated": {
      store.dispatch(upsertAgentLocal(payload as Agent));
      break;
    }
    case "agents:deleted": {
      store.dispatch(removeAgentLocal((payload as { id: string }).id));
      break;
    }
    case "agents:reordered": {
      const { teamId, agentIds } = payload as { teamId: string | null; agentIds: string[] };
      store.dispatch(reorderAgentsLocal({ teamId, agentIds }));
      break;
    }

    // ── Conversations ────────────────────────────────────────────────────────
    case "conversations:created":
    case "conversations:updated": {
      const conv = payload as AgentConversation;
      // Skip public conversations — they belong to public users and should not
      // appear in the admin conversation list.
      if (conv.trigger === "public") break;
      // Only sync conversations owned by the current user
      const userId = store.getState().auth.user?.id;
      if (userId && conv.ownerId !== userId) break;
      store.dispatch(upsertConversationLocal(conv));
      break;
    }
    case "conversations:deleted": {
      store.dispatch(removeConversationLocal((payload as { id: string }).id));
      break;
    }

    // ── Teams ────────────────────────────────────────────────────────────────
    case "teams:created":
    case "teams:updated": {
      store.dispatch(upsertTeamLocal(payload as TeamWithMembers));
      break;
    }
    case "teams:deleted": {
      store.dispatch(removeTeamLocal((payload as { id: string }).id));
      break;
    }

    // ── Tools ─────────────────────────────────────────────────────────────────
    case "tools:created":
    case "tools:updated": {
      store.dispatch(upsertToolLocal(payload as AgentTool));
      break;
    }
    case "tools:deleted": {
      store.dispatch(removeToolLocal((payload as { id: string }).id));
      break;
    }
    case "tools:reordered": {
      const { folderId, toolIds } = payload as { folderId: string | null; toolIds: string[] };
      store.dispatch(reorderToolsLocal({ folderId, toolIds }));
      break;
    }

    case "skills:created":
    case "skills:updated": {
      store.dispatch(upsertSkillLocal(payload as Skill));
      break;
    }
    case "skills:deleted": {
      store.dispatch(removeSkillLocal((payload as { id: string }).id));
      break;
    }

    // ── Tool Folders ──────────────────────────────────────────────────────────
    case "tool-folders:created":
    case "tool-folders:updated": {
      store.dispatch(upsertToolFolderLocal(payload as ToolFolderWithTools));
      break;
    }
    case "tool-folders:deleted": {
      store.dispatch(removeToolFolderLocal((payload as { id: string }).id));
      break;
    }
    case "tool-folders:reordered": {
      store.dispatch(reorderToolFoldersLocal((payload as { folderIds: string[] }).folderIds));
      break;
    }

    // ── MCP Servers ──────────────────────────────────────────────────────────
    case "mcp-servers:created":
    case "mcp-servers:updated": {
      store.dispatch(upsertMcpServerLocal(payload as McpServer));
      break;
    }
    case "mcp-servers:deleted": {
      store.dispatch(removeMcpServerLocal((payload as { id: string }).id));
      break;
    }

    case "my-mcp-servers:created":
    case "my-mcp-servers:updated": {
      store.dispatch(upsertMyMcpServerLocal(payload as MyMcpServer));
      break;
    }
    case "my-mcp-servers:deleted": {
      store.dispatch(removeMyMcpServerLocal((payload as { id: string }).id));
      break;
    }

    // ── KV Store ─────────────────────────────────────────────────────────────
    case "kvstore:created":
    case "kvstore:updated": {
      store.dispatch(upsertKvEntryLocal(payload as KvStoreEntry));
      break;
    }
    case "kvstore:deleted": {
      store.dispatch(removeKvEntryLocal((payload as { id: string }).id));
      break;
    }

    // ── Secrets ──────────────────────────────────────────────────────────────
    case "secrets:created":
    case "secrets:updated": {
      store.dispatch(upsertSecretLocal(payload as SecretEntry));
      break;
    }
    case "secrets:deleted": {
      store.dispatch(removeSecretLocal((payload as { id: string }).id));
      break;
    }

    default:
      break;
  }
}

export function useSocket(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !getAuthToken()) {
      wsClient.disconnect();
      return;
    }

    wsClient.connect();
    const unsub = wsClient.onAny(handleEvent);
    return () => {
      unsub();
      wsClient.disconnect();
    };
  }, [enabled]);
}
