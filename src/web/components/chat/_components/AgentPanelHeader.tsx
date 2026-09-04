import { Button } from "@nonla-agents/ui";
import { AppLogo } from "src/components/AppLogo";

interface AgentPanelHeaderProps {
  title: string;
  onNewChat: () => void;
}

export function AgentPanelHeader({ title, onNewChat }: AgentPanelHeaderProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
      <AppLogo variant="current" size={16} className="shrink-0 text-foreground opacity-40" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</span>
      <Button
        type="text"
        size="xs"
        icon={
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        }
        onClick={onNewChat}
        aria-label="New chat"
        title="New chat"
      />
    </div>
  );
}
