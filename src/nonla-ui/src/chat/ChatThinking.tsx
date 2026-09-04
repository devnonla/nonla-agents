import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";

export type ChatThinkingProps = {
  thinking: string;
  /** Final duration in seconds (shown when not streaming). */
  duration?: number;
  streaming?: boolean;
  className?: string;
};

/** Collapsed by default; expand to read (and stream) reasoning. */
export function ChatThinking({ thinking, duration = 0, streaming = false, className }: ChatThinkingProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!streaming) return;
    setElapsedSec(0);
    const started = Date.now();
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [streaming]);

  useLayoutEffect(() => {
    if (!streaming) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thinking, streaming]);

  if (!thinking.trim()) return null;

  const liveElapsed = Math.max(elapsedSec, duration);
  const shownDuration = Math.max(1, duration);
  const label = streaming ? (liveElapsed >= 3 ? `Thinking ${liveElapsed}s` : "Thinking") : `Thought ${shownDuration}s`;

  return (
    <details
      className={cn("nonla-chat-thinking px-4 pb-2 group/thinking", className)}
      style={{ overflowAnchor: "none" }}
      onToggle={(e) => {
        if (!streaming || !e.currentTarget.open) return;
        const el = bodyRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }}
    >
      <summary className="cursor-pointer select-none text-(length:--chat-body-size) leading-5.5 font-medium text-tertiary-foreground flex items-center gap-1 py-0.5 list-none [&::-webkit-details-marker]:hidden">
        <span className={streaming ? "nonla-chat-shimmer" : undefined}>{label}</span>
        <svg className="w-3 h-3 shrink-0 opacity-0 transition-[opacity,transform] duration-150 group-hover/thinking:opacity-100 group-open/thinking:opacity-100 group-open/thinking:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </summary>

      <div ref={bodyRef} className="pt-2 max-h-40 min-w-0 overflow-y-auto overflow-x-hidden mb-2">
        <p className="text-(length:--chat-body-size) text-tertiary-foreground/80 leading-normal whitespace-pre-wrap wrap-break-word m-0">{thinking}</p>
      </div>
    </details>
  );
}
