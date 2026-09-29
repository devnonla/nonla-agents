import { WindowHeader } from "devnonla-ui";
import { Settings } from "lucide-react";
import { AgentToggleButton } from "src/components/AgentSidePanel";
import { WindowHeaderBackButton } from "src/components/WindowHeaderBackButton";

interface DatatableProjectHeaderProps {
  title: string;
  agentOpen: boolean;
  onToggleAgent: () => void;
  onOpenSettings: () => void;
}

export function DatatableProjectHeader({ title, agentOpen, onToggleAgent, onOpenSettings }: DatatableProjectHeaderProps) {
  return (
    <WindowHeader
      left={
        <div className="flex min-w-0 items-center gap-2">
          <WindowHeaderBackButton to="/datatables" label="Back to datatables" />
          <span className="min-w-0 truncate text-[12px] font-semibold leading-none text-foreground/90">{title}</span>
        </div>
      }
      right={
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onOpenSettings} className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground hover:bg-black/6 hover:text-foreground" aria-label="Project settings">
            <Settings size={14} />
          </button>
          <AgentToggleButton open={agentOpen} onClick={onToggleAgent} />
        </div>
      }
    />
  );
}
