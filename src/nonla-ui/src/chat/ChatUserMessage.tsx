import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";

const MAX_HEIGHT = 150;

export type ChatUserMessageProps = {
  content: string;
  className?: string;
};

export function ChatUserMessage({ content, className }: ChatUserMessageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (el) setIsOverflow(el.scrollHeight > MAX_HEIGHT);
  }, [content]);

  const collapsed = isOverflow && !isExpanded;

  return (
    <div className={cn("nonla-chat-user mt-6 mb-3 mx-4 flex flex-col border border-border rounded-xl bg-neutral-50/10 px-2.5 py-2 pt-1.5", className)}>
      <div ref={contentRef} className="relative overflow-hidden text-(length:--chat-body-size) leading-(--chat-body-leading) text-[var(--nonla-ink)] antialiased whitespace-pre-wrap wrap-break-word transition-[max-height] duration-300 ease-in-out" style={{ maxHeight: collapsed ? MAX_HEIGHT : undefined }}>
        {content}
        {collapsed ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10" style={{ background: "linear-gradient(to top, color-mix(in oklab, var(--primary) 10%, var(--background)), transparent)" }} /> : null}
      </div>
      {isOverflow ? (
        <button type="button" onClick={() => setIsExpanded((v) => !v)} className="mt-1 flex cursor-pointer items-center gap-1 self-start border-0 bg-transparent p-0 font-[inherit] text-xs text-primary/70 transition-colors hover:text-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            {isExpanded ? <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
          {isExpanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
