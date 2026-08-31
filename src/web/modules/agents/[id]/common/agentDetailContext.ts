import { createContext, useContext } from "react";
import type { AgentTool, AgentToolAssignment } from "src/common/types";
import type { Agent, AgentListItem } from "src/common/types";

// ─── Agent Detail Outlet Context ──────────────────────────────────────────────

export interface AgentDetailContext {
  id: string | undefined;
  agent: Agent;
  // Form state — info
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  teamId: string | null;
  setTeamId: (v: string | null) => void;
  selectedProviderId: string | null;
  onProviderChange: (pid: string | null) => void;
  aiModel: string;
  setAiModel: (v: string) => void;
  // Form state — prompt
  systemPrompt: string;
  setSystemPrompt: (v: string) => void;
  // Form state — public
  isPublic: boolean;
  setIsPublic: (v: boolean) => void;
  publicPassword?: string;
  setPublicPassword: (v: string) => void;
  // Form state — tools (junction table assignments)
  toolAssignments: AgentToolAssignment[];
  setToolAssignments: (v: AgentToolAssignment[]) => void;
  // Form state — callable agents
  callableAgentIds: string[];
  setCallableAgentIds: (v: string[]) => void;
  // Tool catalog (all available tools)
  allTools: AgentTool[];
  // Shared data (slim list — other agents for picker / call-agent)
  agents: AgentListItem[];
  // Actions
  onDelete: () => Promise<void>;
}

// ─── Standalone React Context ─────────────────────────────────────────────────
// Used when rendering agent detail pages in the overlay.

export const AgentDetailCtx = createContext<AgentDetailContext | null>(null);

/**
 * Hook to access the agent detail context from the overlay provider.
 */
export function useAgentDetailContext(): AgentDetailContext {
  const ctx = useContext(AgentDetailCtx);
  if (!ctx) {
    throw new Error("useAgentDetailContext must be used within an AgentDetailCtx.Provider");
  }
  return ctx;
}
