import type { Agent } from "src/common/types";
import { UserAvatar } from "src/components/UserAvatar";

const STARTERS = ["What can you help me with?", "Brainstorm a few ideas with me", "Walk me through how you work"] as const;

interface ChatEmptyStateProps {
  agent: Agent;
  onStarter: (text: string) => void;
  disabled?: boolean;
}

export function ChatEmptyState({ agent, onStarter, disabled }: ChatEmptyStateProps) {
  const modelLabel = agent.aiModel?.split("/").pop() ?? null;
  const description = agent.description?.trim() || null;

  return (
    <div className="flex flex-col items-center justify-center min-h-full w-full px-6 py-10 text-center animate-[fadeIn_0.35s_ease-out_both]">
      <div className="relative mb-5">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: "radial-gradient(circle, color-mix(in oklab, var(--brand) 28%, transparent) 0%, transparent 70%)",
          }}
        />
        <div
          className="relative rounded-full p-0.5"
          style={{
            background: "linear-gradient(145deg, color-mix(in oklab, var(--brand-soft) 55%, transparent), transparent 60%)",
          }}
        >
          <div className="rounded-full bg-popover p-0.5">
            <UserAvatar avatar={agent.avatar} name={agent.name} size={64} className="shrink-0" />
          </div>
        </div>
      </div>

      <h2 className="m-0 text-[22px] font-semibold tracking-tight text-foreground leading-snug">Hi, I&apos;m {agent.name}</h2>

      {description ? <p className="mt-2 mb-0 max-w-90 text-[13px] leading-relaxed text-tertiary-foreground line-clamp-2">{description}</p> : <p className="mt-2 mb-0 max-w-[320px] text-[13px] leading-relaxed text-tertiary-foreground">Send a message to start working together.</p>}

      {(modelLabel || agent.toolCount > 0) && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-quaternary-foreground">
          {modelLabel && <span className="truncate max-w-45">{modelLabel}</span>}
          {modelLabel && agent.toolCount > 0 && (
            <span aria-hidden className="opacity-40">
              ·
            </span>
          )}
          {agent.toolCount > 0 && (
            <span>
              {agent.toolCount} {agent.toolCount === 1 ? "tool" : "tools"}
            </span>
          )}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-2 max-w-130">
        {STARTERS.map((text) => (
          <button
            key={text}
            type="button"
            disabled={disabled}
            onClick={() => onStarter(text)}
            className="px-3 py-1.5 rounded-lg border border-border bg-transparent text-[12px] font-medium text-tertiary-foreground cursor-pointer transition-colors duration-150 font-[inherit] hover:border-border hover:bg-muted/60 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
