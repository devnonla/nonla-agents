import { useDroppable } from "@dnd-kit/core";
import { Button } from "@nonla-agents/ui";
import { AddIcon } from "@solar-icons/react/dynamic/add";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { UsersGroupTwoRoundedIcon } from "@solar-icons/react/dynamic/users-group-two-rounded";
import { cn } from "src/common/lib/cn";
import type { AgentListItem } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { AgentCardGrid } from "./AgentCardGrid";
import { AgentsSectionHeader } from "./AgentsSectionHeader";
import { NewAgentDialog } from "./NewAgentDialog";

interface TeamAgentsSectionProps {
  team: TeamWithMembers;
  agents: AgentListItem[];
  onNavigate: (id: string) => void;
  onEditTeam: (team: TeamWithMembers) => void;
}

export function TeamAgentsSection({ team, agents, onNavigate, onEditTeam }: TeamAgentsSectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: team.id,
    data: { type: "team", teamId: team.id },
  });

  return (
    <section ref={setNodeRef} className={cn("group/team rounded-2xl transition-colors", isOver && "bg-muted/35 ring-1 ring-border/80")}>
      <AgentsSectionHeader
        icon={
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <UsersGroupTwoRoundedIcon size={16} />
          </div>
        }
        title={team.name}
        actions={
          <div className="flex items-center gap-0.5">
            <NewAgentDialog defaultTeamId={team.id}>
              <Button type="text" size="small" className="px-1.5! opacity-0 transition-opacity duration-150 group-hover/team:opacity-100" title="Add agent to team" icon={<AddIcon size={15} />} />
            </NewAgentDialog>
            <Button type="text" size="small" onClick={() => onEditTeam(team)} className="px-1.5! opacity-0 transition-opacity duration-150 group-hover/team:opacity-100" title="Edit team" icon={<PenNewSquareIcon size={15} />} />
          </div>
        }
      />

      <RenderIf condition={agents.length > 0} fallback={<p className="m-0 rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Drop agents here</p>}>
        <AgentCardGrid agents={agents} onNavigate={onNavigate} />
      </RenderIf>
    </section>
  );
}
