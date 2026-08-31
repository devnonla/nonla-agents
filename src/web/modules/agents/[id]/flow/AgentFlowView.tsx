// ─── Agent Flow View ──────────────────────────────────────────────────────────
// React Flow canvas with current agent at center. To the right:
//   • Tools — single card; popover toggles tools grouped by folder,
//     plus a nested Datatables group (one switch per project)
//     Connected tools fan out as leaves: folder icon + name → tool icon + name
//   • MCP Servers — single card; popover toggles tools grouped by server
//     Connected tools fan out as leaves: server icon + name → tool icon + name
//   • Call Agents — single card; popover toggles agents grouped by team
//     Connected agents fan out as child nodes to the right of Call Agents

import { type Connection, type Edge, type Node, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow, useStore } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, AgentListItem, AgentSkillAssignment, AgentTeam, AgentTool, AgentToolAssignment, McpServer, Skill, ToolFolder } from "src/common/types";
import { CountedEdge } from "./edges/CountedEdge";
import { layoutFanoutSection, measureChildWidth } from "./layout";
import { AgentConfigNode, type AgentConfigNodeType } from "./nodes/AgentConfigNode";
import { type CallAgentTeamGroup, CallAgentsNode, type CallAgentsNodeType } from "./nodes/CallAgentsNode";
import { CallableAgentNode, type CallableAgentNodeType } from "./nodes/CallableAgentNode";
import { ConnectedToolNode, type ConnectedToolNodeType } from "./nodes/ConnectedToolNode";
import { type McpServerGroup, McpServersNode, type McpServersNodeType } from "./nodes/McpServersNode";
import { PublishNode, type PublishNodeType } from "./nodes/PublishNode";
import { SkillsNode, type SkillsNodeType } from "./nodes/SkillsNode";
import { type ToolFolderGroup, ToolsNode, type ToolsNodeType } from "./nodes/ToolsNode";

// ─── Node & Edge Types ──────────────────────────────────────────────────────

const nodeTypes = {
  tools: ToolsNode,
  connectedTool: ConnectedToolNode,
  mcpServers: McpServersNode,
  skills: SkillsNode,
  callAgents: CallAgentsNode,
  callableAgent: CallableAgentNode,
  agentConfig: AgentConfigNode,
  publish: PublishNode,
};

const edgeTypes = {
  counted: CountedEdge,
};

// ─── Layout Constants ────────────────────────────────────────────────────────

const CENTER_X = 500;
const CENTER_Y = 400;

const ITEMS_COL_X = CENTER_X + 420;
const SIDE_CARD_H = 72;
const FANOUT_CHILD_GAP_X = 100; // gap between levels of fan-out
const FANOUT_CHILD_GAP_Y = 56; // vertical spacing between sibling agent children
const FANOUT_CHILD_H = 22; // agent leaf height (matches avatar)
const TOOL_FANOUT_GAP_Y = 36; // vertical spacing for tool / mcp leaves
const TOOL_FANOUT_H = 16; // compact tool leaf height (icon + label)
const TOOL_CHILD_CHROME = 44; // group icon + tool icon + gaps for connected tool cards
const AGENT_CHILD_CHROME = 30; // avatar + gap for callable agent leaves
const SECTION_GAP = 28; // min vertical gap between packed sections
const FIT_VIEW_OPTIONS = { padding: 0.3, maxZoom: 1.2 } as const;

function useFitViewWhenReady() {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const paneReady = useStore((s) => s.width > 0 && s.height > 0);
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || !nodesInitialized || !paneReady) return;

    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        fitView({ ...FIT_VIEW_OPTIONS, duration: 0 });
        fitted.current = true;
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [nodesInitialized, paneReady, fitView]);
}

// ─── Edge Colors ─────────────────────────────────────────────────────────────

const TOOL_EDGE_COLOR = "var(--edge-tool)";
const MCP_EDGE_COLOR = "var(--edge-mcp)";
const SKILL_EDGE_COLOR = "var(--edge-skill)";
const DATATABLE_EDGE_COLOR = "var(--edge-datatable)";
const AGENT_EDGE_COLOR = "var(--edge-call-agent)";
const PUBLISH_EDGE_COLOR = "var(--edge-call-agent)";

// ─── Canvas Text Measurement ─────────────────────────────────────────────────

function measureMaxTextWidth(texts: string[], font = '600 12px "Inter var", system-ui'): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 80;
  ctx.font = font;
  return texts.reduce((max, text) => Math.max(max, ctx.measureText(text).width), 0);
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface AgentFlowViewProps {
  agent: Agent;
  agents: AgentListItem[];
  teams: AgentTeam[];
  toolFolders: ToolFolder[];
  allTools: AgentTool[];
  allSkills: Skill[];
  mcpServers: McpServer[];
  datatableProjects: { id: string; name: string }[];
  toolAssignments: AgentToolAssignment[];
  skillAssignments: AgentSkillAssignment[];
  callableAgentIds: string[];
  onRemoveToolAssignment: (toolId: string) => void;
  onAddToolAssignment: (toolId: string) => void;
  onRemoveSkillAssignment: (skillId: string) => void;
  onAddSkillAssignment: (skillId: string) => void;
  onToggleCallableAgent: (agentId: string, enable: boolean) => void;
  // Config node props
  selectedProviderId: string | null;
  aiModel: string;
  systemPrompt: string;
  name: string;
  description: string;
  avatar: string | null;
  onModelChange: (providerId: string, model: string) => void;
  onNameChange: (name: string) => void;
  onDescriptionChange: (desc: string) => void;
  onAvatarChange: (avatar: string) => void | Promise<void>;
  // Publish
  isPublic: boolean;
  onTogglePublish: (checked: boolean) => void;
  publicPassword: string;
  onSavePassword: (password: string) => Promise<void>;
}

// ─── Inner Component ─────────────────────────────────────────────────────────

function AgentFlowInner({
  agent,
  agents,
  teams,
  toolFolders,
  allTools,
  allSkills,
  mcpServers,
  datatableProjects,
  toolAssignments,
  skillAssignments,
  callableAgentIds,
  onRemoveToolAssignment,
  onAddToolAssignment,
  onRemoveSkillAssignment,
  onAddSkillAssignment,
  onToggleCallableAgent,
  selectedProviderId,
  aiModel,
  systemPrompt,
  name,
  description,
  avatar,
  onModelChange,
  onNameChange,
  onDescriptionChange,
  onAvatarChange,
  isPublic,
  onTogglePublish,
  publicPassword,
  onSavePassword,
}: AgentFlowViewProps) {
  const navigate = useNavigate();
  useFitViewWhenReady();
  const assignedToolIds = useMemo(() => new Set(toolAssignments.map((a) => a.toolId)), [toolAssignments]);
  const assignedSkillIds = useMemo(() => new Set(skillAssignments.map((a) => a.skillId)), [skillAssignments]);
  const callableSet = useMemo(() => new Set(callableAgentIds), [callableAgentIds]);

  const handleToggleTool = useCallback(
    (toolId: string, connected: boolean) => {
      if (connected) onAddToolAssignment(toolId);
      else onRemoveToolAssignment(toolId);
    },
    [onAddToolAssignment, onRemoveToolAssignment],
  );

  const handleToggleSkill = useCallback(
    (skillId: string, connected: boolean) => {
      if (connected) onAddSkillAssignment(skillId);
      else onRemoveSkillAssignment(skillId);
    },
    [onAddSkillAssignment, onRemoveSkillAssignment],
  );

  const toolGroups = useMemo((): ToolFolderGroup[] => {
    const activeTools = allTools.filter((t) => t.isActive !== false && t.name !== "call_agent" && t.name !== "datatable" && t.id !== "builtin:datatable");
    const builtin: { id: string; label: string; connected: boolean; sortOrder: number }[] = [];
    const byFolder = new Map<string | null, { id: string; label: string; connected: boolean; sortOrder: number }[]>();
    const folderMeta = new Map(toolFolders.map((f) => [f.id, f]));

    for (const tool of activeTools) {
      const item = {
        id: tool.id,
        label: tool.label || tool.name,
        connected: assignedToolIds.has(tool.id),
        sortOrder: tool.sortOrder ?? 0,
      };
      if (tool.id.startsWith("builtin:")) {
        builtin.push(item);
        continue;
      }
      const fid = tool.folderId && folderMeta.has(tool.folderId) ? tool.folderId : null;
      if (!byFolder.has(fid)) byFolder.set(fid, []);
      byFolder.get(fid)!.push(item);
    }

    const sortTools = (items: typeof builtin) => [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)).map(({ id, label, connected }) => ({ id, label, connected }));

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
  }, [allTools, toolFolders, assignedToolIds, datatableProjects]);

  const callAgentTeams = useMemo((): CallAgentTeamGroup[] => {
    const otherAgents = agents.filter((a) => a.id !== agent.id).sort((a, b) => a.name.localeCompare(b.name));
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
  }, [agents, agent.id, teams, callableSet]);

  // ─── Build Nodes ────────────────────────────────────────────────────────────

  const nodes = useMemo(() => {
    const result: Node[] = [];

    const mcpGroups: McpServerGroup[] = [];
    for (const server of mcpServers) {
      if (server.isActive === false) continue;
      const catalog = [...(server.tools ?? [])].sort((a, b) => a.name.localeCompare(b.name));
      if (catalog.length === 0) continue;
      mcpGroups.push({
        id: server.id,
        name: server.name,
        tools: catalog.map((t) => ({
          id: `mcp:${server.id}:${t.name}`,
          label: t.name,
          connected: assignedToolIds.has(`mcp:${server.id}:${t.name}`),
        })),
      });
    }

    // ── Measure widths ──────────────────────────────────────────────────────

    const SIDE_CARD_W = 104;
    const groupInnerWidth = SIDE_CARD_W;

    // ── Connected children (needed for auto layout) ─────────────────────────

    const hasLegacyAllDatatables = assignedToolIds.has("builtin:datatable") && ![...assignedToolIds].some((id) => id.startsWith("datatable:"));

    const connectedFromGroups = toolGroups.flatMap((g) => {
      const isDatatable = g.id === "__datatables__";
      const isFolder = g.id !== null && g.id !== "__builtin__";
      return g.tools
        .filter((t) => t.connected)
        .map((t) => ({
          id: t.id,
          label: t.label,
          folder: isFolder ? g.name : undefined,
          connected: t.connected,
          accent: (isDatatable ? "datatable" : "tool") as "datatable" | "tool",
        }));
    });

    const legacyDatatableLeaf = hasLegacyAllDatatables
      ? [
          {
            id: "builtin:datatable",
            label: "All projects",
            folder: "Datatables",
            connected: true,
            accent: "datatable" as const,
          },
        ]
      : [];

    const folderStart = connectedFromGroups.findIndex((t) => t.folder && t.accent !== "datatable");
    const connectedTools = folderStart === -1 ? [...connectedFromGroups, ...legacyDatatableLeaf] : [...connectedFromGroups.slice(0, folderStart), ...legacyDatatableLeaf, ...connectedFromGroups.slice(folderStart)];

    // Servers with ≥1 connected tool, flattened to leaves
    const connectedMcpBranches = mcpGroups
      .map((g) => ({
        id: g.id,
        name: g.name,
        tools: g.tools.filter((t) => t.connected).sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .filter((g) => g.tools.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Flat leaves: server icon + name → tool icon + name
    const connectedMcpTools = connectedMcpBranches.flatMap((b) =>
      b.tools.map((t) => ({
        id: t.id,
        label: t.label,
        folder: b.name,
        connected: t.connected,
      })),
    );

    const skillToggleItems = [...allSkills]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({
        id: s.id,
        label: s.name,
        connected: assignedSkillIds.has(s.id),
      }));

    const connectedSkills = skillToggleItems.filter((s) => s.connected);

    const connectedAgents = callAgentTeams
      .flatMap((t) => t.agents)
      .filter((a) => a.connected)
      .sort((a, b) => a.name.localeCompare(b.name));

    // ── Pack sections top→bottom so fan-outs never collide ──────────────────

    const toolsLayout0 = layoutFanoutSection(0, SIDE_CARD_H, connectedTools.length, TOOL_FANOUT_GAP_Y, TOOL_FANOUT_H);
    const toolsSectionH = toolsLayout0.sectionBottom;

    const mcpLayout0 = layoutFanoutSection(0, SIDE_CARD_H, connectedMcpTools.length, TOOL_FANOUT_GAP_Y, TOOL_FANOUT_H);
    const mcpSectionH = mcpGroups.length > 0 ? mcpLayout0.sectionBottom : 0;

    const skillsLayout0 = layoutFanoutSection(0, SIDE_CARD_H, connectedSkills.length, TOOL_FANOUT_GAP_Y, TOOL_FANOUT_H);
    const skillsSectionH = skillsLayout0.sectionBottom;

    const agentsLayout0 = layoutFanoutSection(0, SIDE_CARD_H, connectedAgents.length, FANOUT_CHILD_GAP_Y, FANOUT_CHILD_H);
    const agentsSectionH = agentsLayout0.sectionBottom;

    const sectionHeights: number[] = [toolsSectionH];
    if (mcpGroups.length > 0) sectionHeights.push(mcpSectionH);
    sectionHeights.push(skillsSectionH);
    sectionHeights.push(agentsSectionH);

    const totalHeight = sectionHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, sectionHeights.length - 1) * SECTION_GAP;

    let cursorY = CENTER_Y - totalHeight / 2 + 20;

    const toolsLayout = layoutFanoutSection(cursorY, SIDE_CARD_H, connectedTools.length, TOOL_FANOUT_GAP_Y, TOOL_FANOUT_H);
    cursorY = toolsLayout.sectionBottom + SECTION_GAP;

    const mcpLayout = layoutFanoutSection(cursorY, SIDE_CARD_H, connectedMcpTools.length, TOOL_FANOUT_GAP_Y, TOOL_FANOUT_H);
    if (mcpGroups.length > 0) {
      cursorY = mcpLayout.sectionBottom + SECTION_GAP;
    }

    const skillsLayout = layoutFanoutSection(cursorY, SIDE_CARD_H, connectedSkills.length, TOOL_FANOUT_GAP_Y, TOOL_FANOUT_H);
    cursorY = skillsLayout.sectionBottom + SECTION_GAP;

    const agentsLayout = layoutFanoutSection(cursorY, SIDE_CARD_H, connectedAgents.length, FANOUT_CHILD_GAP_Y, FANOUT_CHILD_H);

    const midX = ITEMS_COL_X + groupInnerWidth + FANOUT_CHILD_GAP_X;

    // ── 0. Config Node (central node) ──────────────────────────────────────

    const configNode: AgentConfigNodeType = {
      id: "config",
      type: "agentConfig",
      position: { x: CENTER_X - 190, y: CENTER_Y - 40 },
      style: { width: 380, height: "auto" },
      data: {
        name,
        description,
        avatar,
        selectedProviderId,
        aiModel,
        systemPrompt,
        onNameChange,
        onDescriptionChange,
        onAvatarChange,
        onModelChange,
        onOpenPrompt: () => navigate(`/agents/${agent.id}/instruct`),
        isPublic,
        onTogglePublish,
      },
    };
    result.push(configNode);

    // ── 0b. Publish Node (left of config, visible when public) ──────────

    if (isPublic) {
      const publishNode: PublishNodeType = {
        id: "publish",
        type: "publish",
        position: { x: CENTER_X - 190 - 220, y: CENTER_Y + 440 },
        draggable: true,
        data: {
          isPublic,
          agentId: agent.id,
          publicPassword,
          onSavePassword,
        },
      };
      result.push(publishNode);
    }

    // ── 1. Tools — root → tool leaves (flat) ─────────────────────────────────

    {
      const toolsNode: ToolsNodeType = {
        id: "tools",
        type: "tools",
        position: { x: ITEMS_COL_X, y: toolsLayout.parentY },
        draggable: false,
        connectable: false,
        data: {
          groups: toolGroups,
          width: groupInnerWidth,
          onToggleTool: handleToggleTool,
        },
      };
      result.push(toolsNode);

      if (connectedTools.length > 0) {
        const childWidth = measureChildWidth(
          connectedTools.map((t) => (t.folder ? `${t.folder} → ${t.label}` : t.label)),
          TOOL_CHILD_CHROME,
          groupInnerWidth,
          measureMaxTextWidth,
        );

        connectedTools.forEach((tool, i) => {
          const leaf: ConnectedToolNodeType = {
            id: `tool-child-${tool.id}`,
            type: "connectedTool",
            position: { x: midX, y: toolsLayout.childTop + i * TOOL_FANOUT_GAP_Y },
            draggable: false,
            connectable: false,
            selectable: false,
            data: {
              label: tool.label,
              folder: tool.folder,
              width: childWidth,
              accent: tool.accent,
            },
          };
          result.push(leaf);
        });
      }
    }

    // ── 2. MCP Servers — root → tool leaves (flat) ───────────────────────────

    if (mcpGroups.length > 0) {
      const mcpNode: McpServersNodeType = {
        id: "mcp-servers",
        type: "mcpServers",
        position: { x: ITEMS_COL_X, y: mcpLayout.parentY },
        draggable: false,
        connectable: false,
        data: {
          groups: mcpGroups,
          width: groupInnerWidth,
          onToggleTool: handleToggleTool,
        },
      };
      result.push(mcpNode);

      if (connectedMcpTools.length > 0) {
        const childWidth = measureChildWidth(
          connectedMcpTools.map((t) => `${t.folder} → ${t.label}`),
          TOOL_CHILD_CHROME,
          groupInnerWidth,
          measureMaxTextWidth,
        );

        connectedMcpTools.forEach((tool, i) => {
          const leaf: ConnectedToolNodeType = {
            id: `tool-child-${tool.id}`,
            type: "connectedTool",
            position: { x: midX, y: mcpLayout.childTop + i * TOOL_FANOUT_GAP_Y },
            draggable: false,
            connectable: false,
            selectable: false,
            data: {
              label: tool.label,
              folder: tool.folder,
              width: childWidth,
              accent: "mcp",
            },
          };
          result.push(leaf);
        });
      }
    }

    // ── 2b. Skills — root → skill leaves ─────────────────────────────────────

    {
      const skillsNode: SkillsNodeType = {
        id: "skills",
        type: "skills",
        position: { x: ITEMS_COL_X, y: skillsLayout.parentY },
        draggable: false,
        connectable: false,
        data: {
          skills: skillToggleItems,
          width: groupInnerWidth,
          onToggleSkill: handleToggleSkill,
        },
      };
      result.push(skillsNode);

      if (connectedSkills.length > 0) {
        const childWidth = measureChildWidth(
          connectedSkills.map((s) => s.label),
          TOOL_CHILD_CHROME,
          groupInnerWidth,
          measureMaxTextWidth,
        );

        connectedSkills.forEach((skill, i) => {
          const leaf: ConnectedToolNodeType = {
            id: `skill-child-${skill.id}`,
            type: "connectedTool",
            position: { x: midX, y: skillsLayout.childTop + i * TOOL_FANOUT_GAP_Y },
            draggable: false,
            connectable: false,
            selectable: false,
            data: {
              label: skill.label,
              width: childWidth,
              accent: "skill",
            },
          };
          result.push(leaf);
        });
      }
    }

    // ── 3. Call Agents — single card + fan-out children ────────────────────

    {
      const callAgentsNode: CallAgentsNodeType = {
        id: "call-agents",
        type: "callAgents",
        position: { x: ITEMS_COL_X, y: agentsLayout.parentY },
        draggable: false,
        connectable: false,
        data: {
          teams: callAgentTeams,
          width: groupInnerWidth,
          onToggleAgent: onToggleCallableAgent,
        },
      };
      result.push(callAgentsNode);

      if (connectedAgents.length > 0) {
        const childWidth = measureChildWidth(
          connectedAgents.map((a) => a.name),
          AGENT_CHILD_CHROME,
          groupInnerWidth,
          measureMaxTextWidth,
        );

        connectedAgents.forEach((ag, i) => {
          const child: CallableAgentNodeType = {
            id: `agent-${ag.id}`,
            type: "callableAgent",
            position: { x: midX, y: agentsLayout.childTop + i * FANOUT_CHILD_GAP_Y },
            draggable: false,
            connectable: false,
            selectable: false,
            data: {
              name: ag.name,
              avatar: ag.avatar,
              width: childWidth,
            },
          };
          result.push(child);
        });
      }
    }

    return result;
  }, [
    agent,
    mcpServers,
    toolGroups,
    callAgentTeams,
    assignedToolIds,
    assignedSkillIds,
    allSkills,
    handleToggleTool,
    handleToggleSkill,
    onToggleCallableAgent,
    selectedProviderId,
    aiModel,
    systemPrompt,
    name,
    description,
    avatar,
    onModelChange,
    onNameChange,
    onDescriptionChange,
    onAvatarChange,
    isPublic,
    onTogglePublish,
    publicPassword,
    onSavePassword,
    navigate,
  ]);

  // Tools that belong to an MCP server (edges go from server node, not tool node)
  const mcpToolIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of mcpServers) {
      for (const t of s.tools ?? []) {
        ids.add(`mcp:${s.id}:${t.name}`);
      }
    }
    return ids;
  }, [mcpServers]);

  const localAssignedToolIds = useMemo(() => {
    const hasDatatableProject = toolAssignments.some((a) => a.toolId.startsWith("datatable:"));
    return toolAssignments.map((a) => a.toolId).filter((id) => !mcpToolIds.has(id) && (id !== "builtin:datatable" || !hasDatatableProject));
  }, [toolAssignments, mcpToolIds]);

  const mcpServerConnectedIds = useMemo(() => {
    const byServer = new Map<string, string[]>();
    for (const toolId of assignedToolIds) {
      if (!toolId.startsWith("mcp:")) continue;
      const rest = toolId.slice(4);
      const idx = rest.indexOf(":");
      if (idx <= 0) continue;
      const serverId = rest.slice(0, idx);
      if (!byServer.has(serverId)) byServer.set(serverId, []);
      byServer.get(serverId)!.push(toolId);
    }
    return byServer;
  }, [assignedToolIds]);

  // ─── Build Edges ────────────────────────────────────────────────────────────

  const edges = useMemo(() => {
    const result: Edge[] = [];
    const hasMcpNode = mcpServers.some((s) => s.isActive !== false && (s.tools?.length ?? 0) > 0);
    const allMcpConnectedIds = [...mcpServerConnectedIds.values()].flat();
    const assignedSkillIdList = skillAssignments.map((a) => a.skillId);
    const toolsCount = localAssignedToolIds.length;
    const mcpCount = allMcpConnectedIds.length;
    const skillsCount = assignedSkillIdList.length;
    const agentsCount = callableAgentIds.length;

    // Tools: always link card → config; fan-out only for connected leaves
    result.push({
      id: "edge-tools",
      source: "tools",
      sourceHandle: "to-config",
      target: "config",
      targetHandle: "tools",
      type: "counted",
      animated: false,
      selectable: false,
      deletable: false,
      focusable: false,
      data: { count: toolsCount, color: TOOL_EDGE_COLOR },
      style: { stroke: TOOL_EDGE_COLOR, strokeWidth: 2, opacity: toolsCount > 0 ? 0.5 : 0.22 },
    });

    for (const toolId of localAssignedToolIds) {
      const isDatatable = toolId.startsWith("datatable:");
      result.push({
        id: `edge-tool-child-${toolId}`,
        source: "tools",
        sourceHandle: "to-tools",
        target: `tool-child-${toolId}`,
        type: "default",
        animated: false,
        selectable: false,
        deletable: false,
        focusable: false,
        style: { stroke: isDatatable ? DATATABLE_EDGE_COLOR : TOOL_EDGE_COLOR, strokeWidth: 0.5, opacity: 0.45 },
      });
    }

    // MCP: always link card → config when MCP node exists
    if (hasMcpNode) {
      result.push({
        id: "edge-mcp-servers",
        source: "mcp-servers",
        sourceHandle: "to-config",
        target: "config",
        targetHandle: "tools",
        type: "counted",
        animated: mcpCount > 0,
        selectable: false,
        deletable: false,
        focusable: false,
        data: { count: mcpCount, color: MCP_EDGE_COLOR },
        style: { stroke: MCP_EDGE_COLOR, strokeWidth: 2, opacity: mcpCount > 0 ? 0.5 : 0.22 },
      });

      for (const toolId of allMcpConnectedIds) {
        result.push({
          id: `edge-mcp-child-${toolId}`,
          source: "mcp-servers",
          sourceHandle: "to-servers",
          target: `tool-child-${toolId}`,
          type: "default",
          animated: true,
          selectable: false,
          deletable: false,
          focusable: false,
          style: { stroke: MCP_EDGE_COLOR, strokeWidth: 1.5, opacity: 0.45 },
        });
      }
    }

    // Skills: always link card → config
    result.push({
      id: "edge-skills",
      source: "skills",
      sourceHandle: "to-config",
      target: "config",
      targetHandle: "skills",
      type: "counted",
      animated: false,
      selectable: false,
      deletable: false,
      focusable: false,
      data: { count: skillsCount, color: SKILL_EDGE_COLOR },
      style: { stroke: SKILL_EDGE_COLOR, strokeWidth: 2, opacity: skillsCount > 0 ? 0.5 : 0.22 },
    });

    for (const skillId of assignedSkillIdList) {
      result.push({
        id: `edge-skill-child-${skillId}`,
        source: "skills",
        sourceHandle: "to-skills",
        target: `skill-child-${skillId}`,
        type: "default",
        animated: false,
        selectable: false,
        deletable: false,
        focusable: false,
        style: { stroke: SKILL_EDGE_COLOR, strokeWidth: 0.5, opacity: 0.45 },
      });
    }

    // Call Agents: always link card → config
    result.push({
      id: "edge-call-agents",
      source: "call-agents",
      sourceHandle: "to-config",
      target: "config",
      targetHandle: "agents",
      type: "counted",
      animated: agentsCount > 0,
      selectable: false,
      deletable: false,
      focusable: false,
      data: { count: agentsCount, color: AGENT_EDGE_COLOR },
      style: { stroke: AGENT_EDGE_COLOR, strokeWidth: 2, opacity: agentsCount > 0 ? 0.5 : 0.22 },
    });

    for (const agentId of callableAgentIds) {
      result.push({
        id: `edge-call-child-${agentId}`,
        source: "call-agents",
        sourceHandle: "to-agents",
        target: `agent-${agentId}`,
        type: "default",
        animated: true,
        selectable: false,
        deletable: false,
        focusable: false,
        style: { stroke: AGENT_EDGE_COLOR, strokeWidth: 1.5, opacity: 0.45 },
      });
    }

    // Edge from Publish node → config node (publish handle)
    if (isPublic) {
      result.push({
        id: "edge-publish",
        source: "publish",
        target: "config",
        targetHandle: "publish",
        type: "default",
        animated: true,
        selectable: false,
        deletable: false,
        focusable: false,
        style: { stroke: PUBLISH_EDGE_COLOR, strokeWidth: 1.5, opacity: 0.35 },
      });
    }

    return result;
  }, [localAssignedToolIds, skillAssignments, callableAgentIds, isPublic, mcpServerConnectedIds, mcpServers]);

  // ─── Connection / validation (mostly unused for modal cards) ──────────────

  const onConnect = useCallback((_connection: Connection) => {}, []);
  const isValidConnection = useCallback((_connection: Connection | Edge) => false, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full min-h-0 w-full agent-detail-flow">
      <style>{`
        .agent-detail-flow .react-flow__edge-path { stroke-width: 2 }
        .agent-detail-flow .react-flow__edge.animated .react-flow__edge-path { stroke-dasharray: 6 4; animation: agentFlowDash 1.2s linear infinite }
        .agent-detail-flow .react-flow__edge { pointer-events: none }
        .agent-detail-flow .react-flow__selection { background: color-mix(in srgb, var(--primary) 8%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent) }
        @keyframes agentFlowDash { to { stroke-dashoffset: -20 } }
      `}</style>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "counted", animated: true }}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        edgesFocusable={false}
        deleteKeyCode={null}
        className="bg-card!"
      />
    </div>
  );
}

// ─── Exported Component (with ReactFlowProvider) ────────────────────────────

export function AgentFlowView(props: AgentFlowViewProps) {
  return (
    <div className="h-full min-h-0 w-full">
      <ReactFlowProvider>
        <AgentFlowInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
