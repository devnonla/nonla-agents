import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type ChatWelcomeProps = {
  name: string;
  description?: string | null;
  /** Avatar node (image / initials). */
  avatar?: ReactNode;
  modelLabel?: string | null;
  toolCount?: number;
  starters?: string[];
  onStarter?: (text: string) => void;
  disabled?: boolean;
  className?: string;
};

const DEFAULT_STARTERS = [
  "What can you help me with?",
  "Brainstorm a few ideas with me",
  "Walk me through how you work",
] as const;

function DefaultAvatar({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <div
      className="flex size-16 items-center justify-center rounded-full bg-brand/20 text-xl font-semibold text-brand-soft"
      aria-hidden
    >
      {initial}
    </div>
  );
}

export function ChatWelcome({
  name,
  description,
  avatar,
  modelLabel,
  toolCount = 0,
  starters = [...DEFAULT_STARTERS],
  onStarter,
  disabled,
  className,
}: ChatWelcomeProps) {
  const desc = description?.trim() || null;

  return (
    <div
      className={cn(
        "nonla-chat-welcome flex flex-col items-center justify-center min-h-full w-full px-6 py-10 text-center",
        className,
      )}
    >
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
          <div className="rounded-full bg-popover p-0.5">{avatar ?? <DefaultAvatar name={name} />}</div>
        </div>
      </div>

      <h2 className="m-0 text-[22px] font-semibold tracking-tight text-foreground leading-snug">Hi, I&apos;m {name}</h2>

      {desc ? (
        <p className="mt-2 mb-0 max-w-90 text-[13px] leading-relaxed text-tertiary-foreground line-clamp-2">{desc}</p>
      ) : (
        <p className="mt-2 mb-0 max-w-[320px] text-[13px] leading-relaxed text-tertiary-foreground">
          Send a message to start working together.
        </p>
      )}

      {(modelLabel || toolCount > 0) && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-quaternary-foreground">
          {modelLabel ? <span className="truncate max-w-45">{modelLabel}</span> : null}
          {modelLabel && toolCount > 0 ? (
            <span aria-hidden className="opacity-40">
              ·
            </span>
          ) : null}
          {toolCount > 0 ? (
            <span>
              {toolCount} {toolCount === 1 ? "tool" : "tools"}
            </span>
          ) : null}
        </div>
      )}

      {starters.length > 0 && onStarter ? (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 max-w-130">
          {starters.map((text) => (
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
      ) : null}
    </div>
  );
}
