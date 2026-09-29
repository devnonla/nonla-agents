import { FluentIcon, Menu, MenuAction, MenuDivider, MenuItem, ensureFluentIcons } from "devnonla-ui";
import { Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "src/common/lib/cn";
import type { AgentListItem } from "src/common/types";
import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { NewTeamDialog } from "src/modules/agents/components/NewTeamDialog";
import { TeamDialog } from "src/modules/agents/components/TeamDialog";
import { useAppSelector } from "src/store/store";

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
  const label = selectedTeam?.name ?? "All agents";

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
      <Menu
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-current={active ? "true" : undefined}
            className={cn(
              "inline-flex h-7 max-w-52 items-center rounded-md border-0 px-2.5 text-sm font-medium leading-5 cursor-pointer ring-1 ring-black/5",
              selectedTeam ? "bg-white/60 text-foreground" : "bg-white/40 text-foreground/85",
              "hover:bg-white/60 hover:text-foreground",
              (active || open) && "text-foreground",
            )}
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <FluentIcon name={selectedTeam ? "people-team-24" : "people-community-24"} size={16} className="shrink-0" />
              <span className="truncate">{label}</span>
            </span>
          </button>
        }
      >
        <MenuItem icon={<FluentIcon name="people-community-24" size={16} />} label="All teams" extra={agents.length} selected={selectedTeamId === null} onClick={() => select(null)} />
        {sortedTeams.length > 0 ? (
          <>
            <MenuDivider />
            <div className="flex max-h-80 flex-col gap-px overflow-y-auto">
              {sortedTeams.map((team) => (
                <MenuItem
                  key={team.id}
                  icon={<FluentIcon name="people-team-24" size={16} />}
                  label={team.name}
                  extra={countByTeam.get(team.id) ?? 0}
                  selected={selectedTeamId === team.id}
                  onClick={() => select(team.id)}
                  action={
                    <MenuAction aria-label={`Edit ${team.name}`} title="Edit team" onClick={() => editTeam(team)}>
                      <Pencil size={16} />
                    </MenuAction>
                  }
                />
              ))}
            </div>
          </>
        ) : null}
        <MenuDivider />
        <MenuItem
          icon={<Plus size={16} />}
          label="Add New Team"
          onClick={() => {
            setOpen(false);
            window.setTimeout(() => setNewTeamOpen(true), 0);
          }}
        />
      </Menu>

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
