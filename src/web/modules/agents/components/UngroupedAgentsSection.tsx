import { useDroppable } from "@dnd-kit/core";
import { BotIcon } from "@solar-icons/react/dynamic/bot";
import { cn } from "src/common/lib/cn";
import type { AgentListItem } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { AgentCardGrid } from "./AgentCardGrid";
import { AgentsSectionHeader } from "./AgentsSectionHeader";

const UNGROUPED_ID = "ungrouped";

interface UngroupedAgentsSectionProps {
  agents: AgentListItem[];
  onNavigate: (id: string) => void;
}

export function UngroupedAgentsSection({ agents, onNavigate }: UngroupedAgentsSectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: UNGROUPED_ID,
    data: { type: "team", teamId: null },
  });

  return (
    <section ref={setNodeRef} className={cn("rounded-2xl transition-colors", isOver && "bg-muted/35 ring-1 ring-border/80")}>
      <AgentsSectionHeader
        icon={
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <BotIcon size={16} />
          </div>
        }
        title="Ungrouped"
      />
      <RenderIf condition={agents.length > 0} fallback={<p className="m-0 rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Drop agents here</p>}>
        <AgentCardGrid agents={agents} onNavigate={onNavigate} />
      </RenderIf>
    </section>
  );
}
