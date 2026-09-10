import { Popover } from "@nonla-agents/ui";
import { AltArrowDownIcon } from "@solar-icons/react/dynamic/alt-arrow-down";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { AgentListItem } from "src/common/types";
import { cn } from "src/lib/utils";
import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { NewTeamDialog } from "src/modules/agents/components/NewTeamDialog";
import { TeamDialog } from "src/modules/agents/components/TeamDialog";
import { ensureFluentIcons, fluentIconRef } from "src/modules/tools/common/iconify";
import { ToolIcon } from "src/modules/tools/components/ToolIcon";
import { useAppSelector } from "src/store/store";

function MenuIcon({ name }: { name: string }) {
  return <ToolIcon icon={fluentIconRef(name)} size={16} />;
}

export const MEADOW_MENU_SURFACE = "rounded-xl border-[rgb(255_248_230/0.5)] bg-[rgb(247_244_232/0.66)] shadow-[inset_0_1px_0_rgb(255_250_235/0.55)] backdrop-blur-xl";

export function AgentsMenu({
  selectedTeamId,
  onSelectTeam,
  active,
}: {
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [newTeamOpen, setNewTeamOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamWithMembers | null>(null);
  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];
  const agents = useAppSelector((s) => s.agents.items) as AgentListItem[];

  const sortedTeams = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);
  const countByTeam = useMemo(() => {
    const counts = new Map<string, number>();
    for (const agent of agents) {
      if (!agent.teamId) continue;
      counts.set(agent.teamId, (counts.get(agent.teamId) ?? 0) + 1);
    }
    return counts;
  }, [agents]);

  useEffect(() => {
    void ensureFluentIcons();
  }, []);

  const selectedTeam = selectedTeamId ? (sortedTeams.find((team) => team.id === selectedTeamId) ?? null) : null;
  const label = selectedTeam?.name ?? "Agents";

  const select = (teamId: string | null) => {
    onSelectTeam(teamId);
    setOpen(false);
  };

  const editTeam = (team: TeamWithMembers) => {
    setOpen(false);
    window.setTimeout(() => setEditingTeam(team), 0);
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="bottomLeft"
        contentClassName={`w-[220px] p-1 ${MEADOW_MENU_SURFACE}`}
        content={
          <div className="flex flex-col gap-px">
            <TeamRow icon={<MenuIcon name="people-community-24" />} label="All teams" count={agents.length} selected={selectedTeamId === null} onClick={() => select(null)} />
            {sortedTeams.length > 0 ? (
              <>
                <div className="mx-2.5 my-1 h-px bg-[rgb(40_32_16/0.08)]" />
                <div className="flex max-h-80 flex-col gap-px overflow-y-auto">
                  {sortedTeams.map((team) => (
                    <TeamRow key={team.id} icon={<MenuIcon name="people-team-24" />} label={team.name} count={countByTeam.get(team.id) ?? 0} selected={selectedTeamId === team.id} onClick={() => select(team.id)} onEdit={() => editTeam(team)} />
                  ))}
                </div>
              </>
            ) : null}
            <div className="mx-2.5 my-1 h-px bg-[rgb(40_32_16/0.08)]" />
            <button
              type="button"
              className="flex min-h-8 w-full items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-sm text-foreground cursor-pointer hover:bg-foreground/5"
              onClick={() => {
                setOpen(false);
                window.setTimeout(() => setNewTeamOpen(true), 0);
              }}
            >
              <MenuIcon name="add-circle-24" />
              Add New Team
            </button>
          </div>
        }
      >
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-current={active ? "true" : undefined}
          className={cn("inline-flex h-7 max-w-44 items-center gap-0.5 rounded-md border-0 bg-transparent px-2.5 text-sm font-medium leading-5 cursor-pointer", active || open ? "bg-[rgb(40_32_16/0.08)] text-foreground" : "text-foreground/85 hover:bg-[rgb(40_32_16/0.06)] hover:text-foreground")}
        >
          <span className="min-w-0 truncate leading-5">{label}</span>
          <AltArrowDownIcon size={12} className={cn("shrink-0 transition-transform duration-150", open && "rotate-180")} />
        </button>
      </Popover>

      <NewTeamDialog
        open={newTeamOpen}
        onOpenChange={setNewTeamOpen}
        onCreated={(team) => {
          onSelectTeam(team.id);
        }}
      />
      <TeamDialog open={!!editingTeam} onClose={() => setEditingTeam(null)} team={editingTeam} />
    </>
  );
}

function TeamRow({
  icon,
  label,
  count,
  selected,
  onClick,
  onEdit,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className={cn("group relative flex min-h-8 items-center rounded-md", selected ? "bg-[rgb(40_32_16/0.08)]" : "hover:bg-foreground/5")}>
      <button type="button" aria-current={selected ? "true" : undefined} onClick={onClick} className={cn("flex min-h-8 w-full items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-sm cursor-pointer", selected ? "font-medium text-foreground" : "font-normal text-foreground")}>
        <span className="inline-flex size-4 shrink-0 items-center justify-center [&_img]:size-4">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={cn("shrink-0 text-xs tabular-nums text-muted-foreground", onEdit && "group-hover:invisible")}>{count}</span>
      </button>
      {onEdit ? (
        <button
          type="button"
          aria-label={`Edit ${label}`}
          title="Edit team"
          onClick={onEdit}
          className="absolute right-1 flex size-6 items-center justify-center rounded-md border-0 bg-transparent p-0 opacity-0 pointer-events-none cursor-pointer group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-[rgb(40_32_16/0.08)]"
        >
          <MenuIcon name="edit-24" />
        </button>
      ) : null}
    </div>
  );
}
