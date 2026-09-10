import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { AgentListItem } from "src/common/types";
import { DesktopHeader } from "src/components/desktop/DesktopHeader";
import { DesktopWindow } from "src/components/desktop/DesktopWindow";
import { MeadowDesktop } from "src/components/desktop/MeadowDesktop";
import { agentIdFromPath, windowKey, windowMeta } from "src/components/desktop/nav";
import { fetchAgents } from "src/modules/agents/common/agentsSlice";
import { type TeamWithMembers, fetchTeams } from "src/modules/agents/common/teamsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

const SELECTED_TEAM_KEY = "nonla-desktop-selected-team";

function loadSelectedTeamId(): string | null {
  try {
    return localStorage.getItem(SELECTED_TEAM_KEY);
  } catch {
    return null;
  }
}

function saveSelectedTeamId(id: string | null) {
  try {
    if (id) localStorage.setItem(SELECTED_TEAM_KEY, id);
    else localStorage.removeItem(SELECTED_TEAM_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export function AppLayout() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  const currentUser = useAppSelector((s) => s.auth.user);
  const agents = useAppSelector((s) => s.agents.items) as AgentListItem[];
  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];
  const agentId = agentIdFromPath(pathname);
  const agentName = agentId ? agents.find((agent) => agent.id === agentId)?.name : undefined;
  const meta = windowMeta(pathname, agentName);
  const isHome = !meta;
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(loadSelectedTeamId);

  useEffect(() => {
    if (selectedTeamId && teams.length > 0 && !teams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(null);
      saveSelectedTeamId(null);
    }
  }, [selectedTeamId, teams]);

  useEffect(() => {
    dispatch(fetchAgents());
    dispatch(fetchTeams());
  }, [dispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isHome) return;
      if (e.shiftKey && e.key === "ArrowUp") {
        e.preventDefault();
        setExpandedFor((current) => (current === windowKey(pathname) ? null : windowKey(pathname)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isHome, pathname]);

  const handleSelectTeam = (teamId: string | null) => {
    setSelectedTeamId(teamId);
    saveSelectedTeamId(teamId);
    if (!isHome) navigate("/");
  };

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#4f7a32]">
      <MeadowDesktop pathname={pathname} onOpen={(to) => navigate(to)} selectedTeamId={selectedTeamId} />

      <DesktopHeader user={currentUser} selectedTeamId={selectedTeamId} onSelectTeam={handleSelectTeam} />

      {!isHome && meta ? (
        <DesktopWindow key={windowKey(pathname)} title={meta.title} expanded={expandedFor === windowKey(pathname)} onClose={() => navigate("/")} onToggleExpand={() => setExpandedFor((current) => (current === windowKey(pathname) ? null : windowKey(pathname)))}>
          <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden scrollbar-visible">
            <Outlet />
          </div>
        </DesktopWindow>
      ) : null}
    </div>
  );
}
