import { ContextMenu } from "@nonla-agents/ui";
import { AddIcon } from "@solar-icons/react/dynamic/add";
import { useEffect, useMemo } from "react";
import meadowWallpaper from "src/assets/desktop-meadow.jpg";
import type { AgentListItem } from "src/common/types";
import { UserAvatar } from "src/components/UserAvatar";
import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { NewAgentDialog } from "src/modules/agents/components/NewAgentDialog";
import { agentMenuItems } from "src/modules/agents/components/agentMenuItems";
import { ensureFluentIcons } from "src/modules/tools/common/iconify";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { MEADOW_MENU_SURFACE } from "./AgentsMenu";
import { DesktopIcon } from "./DesktopIcon";
import { pathIsAgent } from "./nav";

export function MeadowWallpaper() {
  return <img src={meadowWallpaper} alt="" draggable={false} className="absolute inset-0 size-full object-cover object-center pointer-events-none select-none" />;
}

function sortAgents(agents: AgentListItem[]) {
  return [...agents].sort((a, b) => {
    const byOrder = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (byOrder !== 0) return byOrder;
    return a.name.localeCompare(b.name);
  });
}

function AgentMedia({ avatar, name, active }: { avatar: string | null; name: string; active: boolean }) {
  return (
    <span className={`size-11 overflow-hidden rounded-full ring-2 filter-[drop-shadow(0_2px_3px_rgba(0,0,0,0.5))] ${active ? "ring-brand" : "ring-white/85"}`}>
      <UserAvatar avatar={avatar} name={name} size={44} />
    </span>
  );
}

function HireMedia() {
  return (
    <span className="flex size-11 items-center justify-center rounded-full border-2 border-dashed border-white/75 text-white filter-[drop-shadow(0_1px_2px_rgba(0,0,0,0.45))]">
      <AddIcon size={20} />
    </span>
  );
}

function AgentIcon({ agent, pathname, onOpen }: { agent: AgentListItem; pathname: string; onOpen: (to: string) => void }) {
  const dispatch = useAppDispatch();
  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];
  const active = pathIsAgent(pathname, agent.id);
  const items = useMemo(() => agentMenuItems({ agent, teams, dispatch, onOpen: () => onOpen(`/agents/${agent.id}`) }), [agent, dispatch, onOpen, teams]);

  return (
    <ContextMenu overlayClassName={`${MEADOW_MENU_SURFACE} rounded-2xl`} menu={{ items, style: { minWidth: 180 } }}>
      <span className="inline-flex">
        <DesktopIcon label={agent.name} active={active} onClick={() => onOpen(`/agents/${agent.id}`)} media={<AgentMedia avatar={agent.avatar} name={agent.name} active={active} />} />
      </span>
    </ContextMenu>
  );
}

function HireIcon({ defaultTeamId }: { defaultTeamId?: string | null }) {
  return (
    <NewAgentDialog defaultTeamId={defaultTeamId}>
      <DesktopIcon label="New Agent" media={<HireMedia />} />
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

  return (
    <div className="absolute inset-0 bg-[#4f7a32]">
      <MeadowWallpaper />

      <div className="absolute left-0 right-0 top-10.5 bottom-0 z-20">
        <nav aria-label="Agents" className="absolute inset-0 overflow-auto px-3 pt-8 pb-3">
          <div className="flex h-full flex-col flex-wrap content-start gap-x-2 gap-y-3">
            {visibleAgents.map((agent) => (
              <AgentIcon key={agent.id} agent={agent} pathname={pathname} onOpen={onOpen} />
            ))}
            <HireIcon defaultTeamId={selectedTeamId} />
          </div>
        </nav>
      </div>
    </div>
  );
}
