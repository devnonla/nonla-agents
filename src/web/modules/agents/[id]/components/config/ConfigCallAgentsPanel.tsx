// ─── Config: Call Agents Panel ────────────────────────────────────────────────
// Toggle which other agents this agent can call, grouped by team.

import { Switch } from "devnonla-ui";
import { useMemo } from "react";
import type { AgentListItem } from "src/common/types";
import { UserAvatar } from "src/components/UserAvatar";
import { useAppSelector } from "src/store/store";
import { useAgentDetailContext } from "../../common/agentDetailContext";
import { buildCallAgentTeams } from "../../common/configGroups";

export function ConfigCallAgentsPanel() {
  const { id, callableAgentIds, onToggleCallableAgent } = useAgentDetailContext();
  const agents = useAppSelector((s) => s.agents.items) as AgentListItem[];
  const teams = useAppSelector((s) => s.teams.teams);

  const teamGroups = useMemo(() => (id ? buildCallAgentTeams({ agents, currentAgentId: id, teams, callableAgentIds }) : []), [agents, id, teams, callableAgentIds]);
  const totalCount = useMemo(() => teamGroups.flatMap((t) => t.agents).length, [teamGroups]);

  return (
    <section className="max-w-2xl rounded-2xl border border-white/50 bg-white/40 p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.65)]">
      {totalCount === 0 ? (
        <div className="px-2 py-10 text-center text-[12px] text-muted-foreground">No other agents available</div>
      ) : (
        teamGroups.map((team) => (
          <div key={team.id ?? "__ungrouped"} className="w-full pb-1">
            <div className="px-2 pb-1.5 pt-2">
              <span className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{team.name}</span>
            </div>

            <div className="w-full">
              {team.agents.map((agent) => (
                <div key={agent.id} className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/50">
                  <UserAvatar avatar={agent.avatar} name={agent.name} size={22} className="shrink-0 ring-1 ring-white/60" />
                  <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{agent.name}</div>
                  <Switch size="small" className="shrink-0" checked={agent.connected} onChange={(checked) => onToggleCallableAgent(agent.id, checked)} aria-label={`Toggle ${agent.name}`} />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
