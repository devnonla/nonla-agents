import { DesktopStage, DesktopWindow, FluentIcon } from "devnonla-ui";
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { AgentListItem } from "src/common/types";
import { DesktopHeader } from "src/components/desktop/DesktopHeader";
import { MeadowDesktop } from "src/components/desktop/MeadowDesktop";
import { DESKTOP_HOME, agentIdFromPath, windowMeta } from "src/components/desktop/nav";
import { fetchAgents } from "src/modules/agents/common/agentsSlice";
import { type TeamWithMembers, fetchTeams } from "src/modules/agents/common/teamsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

function WindowTitle({ title, icon }: { title?: string; icon: string }) {
  if (!title) return undefined;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <FluentIcon name={icon} size={14} className="shrink-0" />
      <span className="min-w-0 truncate text-xs font-semibold leading-none text-foreground/90">{title}</span>
    </span>
  );
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
  const [expanded, setExpanded] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTeamId && teams.length > 0 && !teams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(null);
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
        setExpanded((current) => !current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isHome]);

  const handleSelectTeam = (teamId: string | null) => {
    setSelectedTeamId(teamId);
    if (!isHome) navigate(DESKTOP_HOME);
  };

  return (
    <DesktopStage>
      <MeadowDesktop pathname={pathname} onOpen={(to) => navigate(to)} selectedTeamId={selectedTeamId} />

      <DesktopHeader user={currentUser} selectedTeamId={selectedTeamId} onSelectTeam={handleSelectTeam} />

      {!isHome && meta ? (
        <DesktopWindow title={meta.title ? <WindowTitle title={meta.title} icon={meta.icon} /> : undefined} persistKey="desktop" expanded={expanded} onClose={() => navigate(DESKTOP_HOME)} onToggleExpand={() => setExpanded((current) => !current)} scroll={false}>
          <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden scrollbar-visible">
            <Outlet />
          </div>
        </DesktopWindow>
      ) : null}
    </DesktopStage>
  );
}
