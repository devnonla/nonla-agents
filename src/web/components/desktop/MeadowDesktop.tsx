import { ContextMenu, DesktopIcon, MeadowDesktop as UiMeadowDesktop, ensureFluentIcons } from "devnonla-ui";
import { Plus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import meadowWallpaper from "src/assets/bg.jpg";
import type { AgentListItem } from "src/common/types";
import { UserAvatar } from "src/components/UserAvatar";
import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { NewAgentDialog } from "src/modules/agents/components/NewAgentDialog";
import { agentMenuItems } from "src/modules/agents/components/agentMenuItems";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { DESKTOP_HOME, isDesktopHome, pathIsAgent } from "./nav";

function sortAgents(agents: AgentListItem[]) {
  return [...agents].sort((a, b) => {
    const byOrder = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (byOrder !== 0) return byOrder;
    return a.name.localeCompare(b.name);
  });
}

function AgentMedia({ avatar, name, active }: { avatar: string | null; name: string; active: boolean }) {
  return (
    <span className={`mb-1.5 size-12 overflow-hidden rounded-full ring-2 filter-[drop-shadow(0_2px_3px_rgba(0,0,0,0.5))] ${active ? "ring-brand" : "ring-white/85"}`}>
      <UserAvatar avatar={avatar} name={name} size={48} />
    </span>
  );
}

function HireMedia() {
  return (
    <span className="mb-1.5 flex size-12 items-center justify-center rounded-full border-2 border-dashed border-white/75 text-white filter-[drop-shadow(0_1px_2px_rgba(0,0,0,0.45))]">
      <Plus size={22} />
    </span>
  );
}

function AgentIcon({
  agent,
  pathname,
  onOpen,
  onDismissWindow,
}: {
  agent: AgentListItem;
  pathname: string;
  onOpen: (to: string) => void;
  onDismissWindow: () => void;
}) {
  const dispatch = useAppDispatch();
  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];
  const active = pathIsAgent(pathname, agent.id);
  const items = useMemo(() => agentMenuItems({ agent, teams, dispatch, onOpen: () => onOpen(`/agents/${agent.id}/config`) }), [agent, dispatch, onOpen, teams]);

  return (
    <ContextMenu
      overlayClassName="rounded-2xl"
      menu={{ items, style: { minWidth: 180 } }}
      onOpenChange={(open) => {
        if (open) onDismissWindow();
      }}
    >
      <span className="inline-flex px-1 py-1.5">
        <DesktopIcon label={agent.name} active={active} onClick={() => onOpen(`/agents/${agent.id}`)} media={<AgentMedia avatar={agent.avatar} name={agent.name} active={active} />} />
      </span>
    </ContextMenu>
  );
}

function HireIcon({ defaultTeamId }: { defaultTeamId?: string | null }) {
  return (
    <NewAgentDialog defaultTeamId={defaultTeamId}>
      <span className="inline-flex px-1 py-1.5">
        <DesktopIcon label="New Agent" media={<HireMedia />} />
      </span>
    </NewAgentDialog>
  );
}

export function MeadowDesktop({
  pathname,
  onOpen,
  selectedTeamId,
}: {
  pathname: string;
  onOpen: (to: string) => void;
  selectedTeamId: string | null;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    void ensureFluentIcons();
  }, []);

  const agents = useAppSelector((s) => s.agents.items) as AgentListItem[];
  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];
  const visibleAgents = useMemo(() => {
    const knownTeams = new Set(teams.map((team) => team.id));
    const list = selectedTeamId ? agents.filter((agent) => agent.teamId === selectedTeamId) : agents.filter((agent) => !agent.teamId || knownTeams.has(agent.teamId));
    return sortAgents(list);
  }, [agents, selectedTeamId, teams]);

  const dismissWindow = () => {
    if (!isDesktopHome(pathname)) navigate(DESKTOP_HOME);
  };

  return (
    <UiMeadowDesktop src={meadowWallpaper}>
      {visibleAgents.map((agent) => (
        <AgentIcon key={agent.id} agent={agent} pathname={pathname} onOpen={onOpen} onDismissWindow={dismissWindow} />
      ))}
      <HireIcon defaultTeamId={selectedTeamId} />
    </UiMeadowDesktop>
  );
}
