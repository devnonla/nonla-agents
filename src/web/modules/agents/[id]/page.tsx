// ─── Agent Detail Page ────────────────────────────────────────────────────────
// Route: /agents/:id/* — Full-screen agent detail with Chat / Instruct / Editor tabs.

import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Agent, AgentListItem, AgentSkillAssignment, AgentTool, AgentToolAssignment, McpServer, Skill } from "src/common/types";
import { fetchTeams } from "src/modules/agents/common/teamsSlice";
import { fetchDatatableProjects } from "src/modules/datatables/common/datatableProjectsSlice";
import { fetchMcpServers } from "src/modules/mcp-servers/common/mcpServersSlice";
import { fetchSkills } from "src/modules/skills/common/skillsSlice";
import { fetchToolFolders } from "src/modules/tools/common/toolFoldersSlice";
import { fetchTools } from "src/modules/tools/common/toolsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { deleteAgent, fetchAgents, fetchOneAgent, updateAgent, upsertAgentLocal } from "../common/agentsSlice";
import { ChatPage } from "./chat/ChatPage";
import { type AgentDetailContext, AgentDetailCtx } from "./common/agentDetailContext";
import { AgentDetailHeader } from "./components/AgentDetailHeader";
import { AgentFlowView } from "./flow/AgentFlowView";
import { MemoryPage } from "./memory/MemoryPage";
import { PromptPage } from "./prompt/PromptPage";

// ─── API helpers ───────────────────────────────────────────────────────────────

const API_BASE = "/api";

async function fetchAssignments(agentId: string): Promise<AgentToolAssignment[]> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/tool-assignments`);
  return res.json();
}

async function fetchSkillAssignments(agentId: string): Promise<AgentSkillAssignment[]> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/skill-assignments`);
  return res.json();
}

async function apiRemoveAssignment(agentId: string, assignmentId: string): Promise<void> {
  await fetch(`${API_BASE}/agents/${agentId}/tool-assignments/${assignmentId}`, { method: "DELETE" });
}

async function apiAddAssignment(agentId: string, toolId: string): Promise<AgentToolAssignment> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/tool-assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolId }),
  });
  return res.json();
}

async function apiRemoveSkillAssignment(agentId: string, assignmentId: string): Promise<void> {
  await fetch(`${API_BASE}/agents/${agentId}/skill-assignments/${assignmentId}`, { method: "DELETE" });
}

async function apiAddSkillAssignment(agentId: string, skillId: string): Promise<AgentSkillAssignment> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/skill-assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skillId }),
  });
  return res.json();
}

async function apiUpdateCallableAgents(agentId: string, callableAgentIds: string[]): Promise<void> {
  await fetch(`${API_BASE}/agents/${agentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callableAgentIds }),
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const isEditor = /\/editor\/?$/.test(location.pathname);
  const agents = useAppSelector((s) => s.agents.items) as AgentListItem[];
  const allTools = useAppSelector((s) => s.tools.items) as AgentTool[];
  const allSkills = useAppSelector((s) => s.skills.items) as Skill[];
  const mcpServers = useAppSelector((s) => s.mcpServers.items) as McpServer[];
  const datatableProjects = useAppSelector((s) => s.datatableProjects.items);
  const teams = useAppSelector((s) => s.teams.teams);
  const toolFolders = useAppSelector((s) => s.toolFolders.folders);

  // ── Detail form state (hydrated only from GET /:id — never from list cache) ──
  const [agent, setAgent] = useState<Agent | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [toolAssignments, setToolAssignments] = useState<AgentToolAssignment[]>([]);
  const toolAssignmentsRef = useRef(toolAssignments);
  toolAssignmentsRef.current = toolAssignments;
  const [skillAssignments, setSkillAssignments] = useState<AgentSkillAssignment[]>([]);
  const skillAssignmentsRef = useRef(skillAssignments);
  skillAssignmentsRef.current = skillAssignments;
  const [callableAgentIds, setCallableAgentIds] = useState<string[]>([]);
  const callableAgentIdsRef = useRef(callableAgentIds);
  callableAgentIdsRef.current = callableAgentIds;
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [publicPassword, setPublicPassword] = useState("");
  const [editorReadyId, setEditorReadyId] = useState<string | null>(null);
  const editorReady = editorReadyId === id;
  const loadedEditorIdRef = useRef<string | null>(null);

  // Detail GET is the source of truth for the open agent
  useEffect(() => {
    if (!id) return;
    setAgent(null);
    setToolAssignments([]);
    setSkillAssignments([]);
    dispatch(fetchOneAgent(id))
      .unwrap()
      .then((ag: Agent) => {
        setAgent(ag);
        dispatch(upsertAgentLocal(ag));
        setName(ag.name);
        setDescription(ag.description ?? "");
        setAvatar(ag.avatar ?? null);
        setTeamId(ag.teamId ?? null);
        setSystemPrompt(ag.systemPrompt ?? "");
        setAiModel(ag.aiModel ?? "");
        setIsPublic(ag.isPublic ?? false);
        setPublicPassword(ag.publicPassword ?? "");
        setCallableAgentIds(ag.callableAgentIds ?? []);
        if (ag.aiProvider) setSelectedProviderId(ag.aiProvider);
      })
      .catch(() => {});
  }, [id, dispatch]);

  // Editor-only catalog + assignments — mount the flow only after this id is loaded
  useEffect(() => {
    if (!id || !isEditor) return;
    if (loadedEditorIdRef.current === id) {
      setEditorReadyId(id);
      return;
    }

    let cancelled = false;
    setToolAssignments([]);
    setSkillAssignments([]);

    void Promise.all([
      fetchAssignments(id).then((rows) => {
        if (!cancelled) setToolAssignments(rows);
      }),
      fetchSkillAssignments(id).then((rows) => {
        if (!cancelled) setSkillAssignments(rows);
      }),
      dispatch(fetchAgents()),
      dispatch(fetchTools()),
      dispatch(fetchSkills()),
      dispatch(fetchToolFolders()),
      dispatch(fetchMcpServers()),
      dispatch(fetchDatatableProjects()),
      dispatch(fetchTeams()),
    ]).finally(() => {
      if (cancelled) return;
      loadedEditorIdRef.current = id;
      setEditorReadyId(id);
    });

    return () => {
      cancelled = true;
    };
  }, [id, isEditor, dispatch]);

  // WS / mutations may upsert a full agent into the list store — merge into detail state
  useEffect(() => {
    if (!id) return;
    const fromStore = agents.find((a) => a.id === id) as Partial<Agent> | undefined;
    if (!fromStore || !Object.prototype.hasOwnProperty.call(fromStore, "systemPrompt")) return;
    setAgent((prev) => {
      if (!prev) return prev;
      if (fromStore.systemPrompt === prev.systemPrompt && fromStore.systemPromptDraft === prev.systemPromptDraft && fromStore.updatedAt === prev.updatedAt) {
        return prev;
      }
      return { ...prev, ...fromStore } as Agent;
    });
  }, [agents, id]);

  const handleProviderChange = useCallback((pid: string | null) => setSelectedProviderId(pid), []);

  const handleDelete = async () => {
    if (!id) return;
    await dispatch(deleteAgent(id));
    navigate("/agents");
  };

  // ── Flow interaction handlers ──────────────────────────────────────────────

  const handleRemoveToolAssignment = useCallback(
    (toolId: string) => {
      if (!id) return;
      const assignment = toolAssignmentsRef.current.find((a) => a.toolId === toolId);
      if (!assignment) return;
      setToolAssignments((prev) => prev.filter((a) => a.toolId !== toolId));
      apiRemoveAssignment(id, assignment.id).catch(() => {
        fetchAssignments(id).then(setToolAssignments);
      });
    },
    [id],
  );

  const handleAddToolAssignment = useCallback(
    (toolId: string) => {
      if (!id) return;
      apiAddAssignment(id, toolId).then((newAssignment) => {
        setToolAssignments((prev) => {
          const merged = prev.some((a) => a.toolId === newAssignment.toolId) ? prev : [...prev, newAssignment];
          if (toolId.startsWith("datatable:")) {
            return merged.filter((a) => a.toolId !== "builtin:datatable");
          }
          return merged;
        });
      });
    },
    [id],
  );

  const handleRemoveSkillAssignment = useCallback(
    (skillId: string) => {
      if (!id) return;
      const assignment = skillAssignmentsRef.current.find((a) => a.skillId === skillId);
      if (!assignment) return;
      setSkillAssignments((prev) => prev.filter((a) => a.skillId !== skillId));
      apiRemoveSkillAssignment(id, assignment.id).catch(() => {
        fetchSkillAssignments(id).then(setSkillAssignments);
      });
    },
    [id],
  );

  const handleAddSkillAssignment = useCallback(
    (skillId: string) => {
      if (!id) return;
      apiAddSkillAssignment(id, skillId).then((newAssignment) => {
        setSkillAssignments((prev) => [...prev, newAssignment]);
      });
    },
    [id],
  );

  const handleToggleCallableAgent = useCallback(
    (agentId: string, enable: boolean) => {
      if (!id) return;
      const prev = callableAgentIdsRef.current;
      const next = enable ? (prev.includes(agentId) ? prev : [...prev, agentId]) : prev.filter((cid) => cid !== agentId);
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return;
      setCallableAgentIds(next);
      apiUpdateCallableAgents(id, next).catch(() => {
        if (callableAgentIdsRef.current === next) setCallableAgentIds(prev);
      });
    },
    [id],
  );

  // ── Flow config handlers (model + name/desc — auto-save) ───────────────

  const handleFlowModelChange = useCallback(
    (providerId: string, model: string) => {
      handleProviderChange(providerId);
      setAiModel(model);
      if (id) dispatch(updateAgent({ id, aiProvider: providerId, aiModel: model }));
    },
    [id, dispatch, handleProviderChange],
  );

  const handleFlowNameChange = useCallback(
    (newName: string) => {
      setName(newName);
      if (id && newName.trim()) dispatch(updateAgent({ id, name: newName.trim() }));
    },
    [id, dispatch],
  );

  const handleFlowDescriptionChange = useCallback(
    (newDesc: string) => {
      setDescription(newDesc);
      if (id) dispatch(updateAgent({ id, description: newDesc.trim() || undefined }));
    },
    [id, dispatch],
  );

  const handleFlowAvatarChange = useCallback(
    async (newAvatar: string) => {
      setAvatar(newAvatar);
      if (id) await dispatch(updateAgent({ id, avatar: newAvatar })).unwrap();
    },
    [id, dispatch],
  );

  const handleTogglePublish = useCallback(
    (checked: boolean) => {
      setIsPublic(checked);
      if (id) dispatch(updateAgent({ id, isPublic: checked }));
    },
    [id, dispatch],
  );

  const handleSavePassword = useCallback(
    async (password: string) => {
      if (!id) return;
      setPublicPassword(password);
      await dispatch(updateAgent({ id, publicPassword: password }));
    },
    [id, dispatch],
  );

  // Loading / not found states
  if (!id) {
    return <Navigate to="/agents" replace />;
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-sm text-muted-foreground">Loading agent…</div>
      </div>
    );
  }

  // ── Context ────────────────────────────────────────────────────────────────

  const ctxValue: AgentDetailContext = {
    id,
    agent,
    name,
    setName,
    description,
    setDescription,
    teamId,
    setTeamId,
    selectedProviderId,
    onProviderChange: handleProviderChange,
    aiModel,
    setAiModel,
    systemPrompt,
    setSystemPrompt,
    isPublic,
    setIsPublic,
    publicPassword,
    setPublicPassword,
    toolAssignments,
    setToolAssignments,
    callableAgentIds,
    setCallableAgentIds,
    allTools,
    agents,
    onDelete: handleDelete,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AgentDetailCtx.Provider value={ctxValue}>
      <div className="flex flex-col h-screen overflow-hidden">
        <AgentDetailHeader id={id} agent={agent} avatar={avatar} onDelete={handleDelete} />

        <div className="flex flex-1 min-h-0 overflow-hidden bg-card">
          <div className="relative h-full min-h-0 min-w-0 flex-1">
            <Routes>
              <Route index element={<ChatPage />} />
              <Route path="chat" element={<Navigate to={`/agents/${id}`} replace />} />
              <Route path="instruct" element={<PromptPage />} />
              <Route path="memory" element={<MemoryPage />} />
              <Route
                path="editor"
                element={
                  editorReady ? (
                    <AgentFlowView
                      key={id}
                      agent={agent}
                      agents={agents}
                      teams={teams}
                      toolFolders={toolFolders}
                      allTools={allTools}
                      allSkills={allSkills}
                      mcpServers={mcpServers}
                      datatableProjects={datatableProjects}
                      toolAssignments={toolAssignments}
                      skillAssignments={skillAssignments}
                      callableAgentIds={callableAgentIds}
                      onRemoveToolAssignment={handleRemoveToolAssignment}
                      onAddToolAssignment={handleAddToolAssignment}
                      onRemoveSkillAssignment={handleRemoveSkillAssignment}
                      onAddSkillAssignment={handleAddSkillAssignment}
                      onToggleCallableAgent={handleToggleCallableAgent}
                      selectedProviderId={selectedProviderId}
                      aiModel={aiModel}
                      systemPrompt={systemPrompt}
                      name={name}
                      description={description}
                      avatar={avatar}
                      onModelChange={handleFlowModelChange}
                      onNameChange={handleFlowNameChange}
                      onDescriptionChange={handleFlowDescriptionChange}
                      onAvatarChange={handleFlowAvatarChange}
                      isPublic={isPublic}
                      onTogglePublish={handleTogglePublish}
                      publicPassword={publicPassword}
                      onSavePassword={handleSavePassword}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-sm text-muted-foreground">Loading editor…</div>
                    </div>
                  )
                }
              />
            </Routes>
          </div>
        </div>
      </div>
    </AgentDetailCtx.Provider>
  );
}
