import { FluentIcon, WindowHeader } from "devnonla-ui";
import { cn } from "src/common/lib/cn";
import type { Agent } from "src/common/types";
import { UserAvatar } from "src/components/UserAvatar";
import { WindowHeaderBackButton } from "src/components/WindowHeaderBackButton";
import { useAgentDetailContext } from "../common/agentDetailContext";
import { ShareAgentButton } from "./ShareAgentButton";

interface AgentDetailHeaderProps {
  id: string;
  agent: Agent;
  avatar: string | null;
}

export function AgentDetailHeader({ id, agent, avatar }: AgentDetailHeaderProps) {
  const { configOpen, onToggleConfig } = useAgentDetailContext();

  return (
    <WindowHeader
      left={
        <div className="flex min-w-0 items-center gap-2">
          {configOpen ? <WindowHeaderBackButton to={`/agents/${id}`} label="Back to chat" /> : null}
          <UserAvatar avatar={avatar ?? agent.avatar} name={agent.name} size={18} className="shrink-0" />
          <span className="min-w-0 truncate text-[12px] font-semibold leading-none text-foreground/90">{agent.name}</span>
        </div>
      }
      right={
        <div className="flex items-center gap-1">
          <ShareAgentButton />
          <button
            type="button"
            onClick={onToggleConfig}
            aria-pressed={configOpen}
            aria-label={configOpen ? "Close config" : "Agent config"}
            title="Config"
            className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md border-0 transition-colors", configOpen ? "bg-brand/15 text-brand-700 hover:bg-brand/20" : "bg-transparent text-muted-foreground hover:bg-black/6 hover:text-foreground")}
          >
            <FluentIcon name="settings-24" size={14} />
          </button>
        </div>
      }
    />
  );
}
