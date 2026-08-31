import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import { cn } from "src/common/lib/cn";
import type { AgentListItem } from "src/common/types";
import { AgentCard } from "./AgentCard";

interface AgentCardGridProps {
  agents: AgentListItem[];
  onNavigate: (id: string) => void;
}

function SortableAgentCard({ agent, onOpen }: { agent: AgentListItem; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: agent.id,
    data: { type: "agent", agentId: agent.id, teamId: agent.teamId ?? null },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn("touch-none", isDragging && "opacity-40 z-10")} {...attributes} {...listeners}>
      <AgentCard agent={agent} onOpen={isDragging ? () => {} : onOpen} />
    </div>
  );
}

export function AgentCardGrid({ agents, onNavigate }: AgentCardGridProps) {
  const agentIds = agents.map((agent) => agent.id);

  return (
    <SortableContext items={agentIds} strategy={rectSortingStrategy}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <SortableAgentCard key={agent.id} agent={agent} onOpen={() => onNavigate(agent.id)} />
        ))}
      </div>
    </SortableContext>
  );
}
