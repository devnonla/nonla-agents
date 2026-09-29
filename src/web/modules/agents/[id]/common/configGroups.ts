// ─── Config group builders ────────────────────────────────────────────────────
// Pure builders that shape catalog + assignment data into toggle groups.

import type { AgentListItem, AgentSkillAssignment, AgentTeam, AgentTool, AgentToolAssignment, McpServer, Skill, ToolFolder } from "src/common/types";

export type ToolToggleItem = {
  id: string;
  label: string;
  connected: boolean;
  icon?: string | null;
};

export type ToolFolderGroup = {
  id: string | null; // null = ungrouped; "__builtin__" = builtins; "__datatables__" = projects
  name: string;
  tools: ToolToggleItem[];
  note?: string;
};

export type McpToolToggleItem = {
  id: string;
  label: string;
  connected: boolean;
  icon?: string | null;
};

export type McpServerGroup = {
  id: string;
  name: string;
  tools: McpToolToggleItem[];
};

export type CallAgentToggleItem = {
  id: string;
  name: string;
  avatar?: string | null;
  teamId: string | null;
  connected: boolean;
};

export type CallAgentTeamGroup = {
  id: string | null; // null = ungrouped
  name: string;
  agents: CallAgentToggleItem[];
};

export type SkillToggleItem = { id: string; label: string; connected: boolean };

export function buildToolGroups(args: { allTools: AgentTool[]; toolFolders: ToolFolder[]; toolAssignments: AgentToolAssignment[]; datatableProjects: { id: string; name: string }[] }): ToolFolderGroup[] {
  const { allTools, toolFolders, toolAssignments, datatableProjects } = args;
  const assignedToolIds = new Set(toolAssignments.map((a) => a.toolId));

  const activeTools = allTools.filter((t) => t.isActive !== false && t.name !== "call_agent" && t.name !== "datatable" && t.id !== "builtin:datatable");
  const builtin: { id: string; label: string; connected: boolean; sortOrder: number; icon?: string | null }[] = [];
  const byFolder = new Map<string | null, { id: string; label: string; connected: boolean; sortOrder: number; icon?: string | null }[]>();
  const folderMeta = new Map(toolFolders.map((f) => [f.id, f]));

  for (const tool of activeTools) {
    const item = {
      id: tool.id,
      label: tool.label || tool.name,
      connected: assignedToolIds.has(tool.id),
      sortOrder: tool.sortOrder ?? 0,
      icon: tool.icon ?? null,
    };
    if (tool.id.startsWith("builtin:")) {
      builtin.push(item);
      continue;
    }
    const fid = tool.folderId && folderMeta.has(tool.folderId) ? tool.folderId : null;
    if (!byFolder.has(fid)) byFolder.set(fid, []);
    byFolder.get(fid)!.push(item);
  }

  const sortTools = (items: typeof builtin) => [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)).map(({ id, label, connected, icon }) => ({ id, label, connected, icon }));

  const groups: ToolFolderGroup[] = [];
  if (builtin.length > 0) {
    groups.push({ id: "__builtin__", name: "Builtin Tools", tools: sortTools(builtin) });
  }

  const hasLegacyAllDatatables = assignedToolIds.has("builtin:datatable") && ![...assignedToolIds].some((id) => id.startsWith("datatable:"));

  const datatableTools = [...datatableProjects]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({
      id: `datatable:${p.id}`,
      label: p.name,
      connected: assignedToolIds.has(`datatable:${p.id}`),
    }));
  if (datatableTools.length > 0 || hasLegacyAllDatatables) {
    groups.push({
      id: "__datatables__",
      name: "Datatables",
      note: hasLegacyAllDatatables ? "All projects. Enable one to switch to per-project access." : undefined,
      tools: datatableTools,
    });
  }

  const folderGroups = [...byFolder.entries()]
    .map(([fid, items]) => ({
      id: fid,
      name: fid ? (folderMeta.get(fid)?.name ?? "Folder") : "Ungrouped",
      sortOrder: fid ? (folderMeta.get(fid)?.sortOrder ?? 0) : Number.MAX_SAFE_INTEGER,
      tools: sortTools(items),
    }))
    .filter((g) => g.tools.length > 0)
    .sort((a, b) => {
      if (a.id === null) return 1;
      if (b.id === null) return -1;
      return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
    })
    .map(({ id, name, tools }) => ({ id, name, tools }));

  groups.push(...folderGroups);
  return groups;
}

export function buildMcpGroups(args: { mcpServers: McpServer[]; toolAssignments: AgentToolAssignment[] }): McpServerGroup[] {
  const { mcpServers, toolAssignments } = args;
  const assignedToolIds = new Set(toolAssignments.map((a) => a.toolId));

  const groups: McpServerGroup[] = [];
  for (const server of mcpServers) {
    if (server.isActive === false) continue;
    const catalog = [...(server.tools ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    if (catalog.length === 0) continue;
    groups.push({
      id: server.id,
      name: server.name,
      tools: catalog.map((t) => ({
        id: `mcp:${server.id}:${t.name}`,
        label: t.name,
        connected: assignedToolIds.has(`mcp:${server.id}:${t.name}`),
      })),
    });
  }
  return groups;
}

export function buildSkillItems(args: { allSkills: Skill[]; skillAssignments: AgentSkillAssignment[] }): SkillToggleItem[] {
  const { allSkills, skillAssignments } = args;
  const assignedSkillIds = new Set(skillAssignments.map((a) => a.skillId));
  return [...allSkills].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ id: s.id, label: s.name, connected: assignedSkillIds.has(s.id) }));
}

export function buildCallAgentTeams(args: { agents: AgentListItem[]; currentAgentId: string; teams: AgentTeam[]; callableAgentIds: string[] }): CallAgentTeamGroup[] {
  const { agents, currentAgentId, teams, callableAgentIds } = args;
  const callableSet = new Set(callableAgentIds);

  const otherAgents = agents.filter((a) => a.id !== currentAgentId).sort((a, b) => a.name.localeCompare(b.name));
  const teamMeta = new Map(teams.map((t) => [t.id, t]));
  const byTeam = new Map<string | null, CallAgentTeamGroup>();

  for (const ag of otherAgents) {
    const tid = ag.teamId && teamMeta.has(ag.teamId) ? ag.teamId : null;
    if (!byTeam.has(tid)) {
      byTeam.set(tid, {
        id: tid,
        name: tid ? (teamMeta.get(tid)?.name ?? "Team") : "No team",
        agents: [],
      });
    }
    byTeam.get(tid)!.agents.push({
      id: ag.id,
      name: ag.name,
      avatar: ag.avatar,
      teamId: ag.teamId,
      connected: callableSet.has(ag.id),
    });
  }

  return [...byTeam.values()].sort((a, b) => {
    if (a.id === null) return 1;
    if (b.id === null) return -1;
    return a.name.localeCompare(b.name);
  });
}
