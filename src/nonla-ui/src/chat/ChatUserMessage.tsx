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

  return (
    <div className={cn("nonla-chat-user mt-5", className)}>
      <div className="flex items-start gap-3 px-3 pt-3 pb-2">
        <div className="flex-1 min-w-0 flex flex-col bg-primary/10 px-4 py-2.5 rounded-xl">
          <div
            ref={contentRef}
            className="relative overflow-hidden transition-[max-height] duration-300 ease-in-out"
            style={{ maxHeight: isExpanded || !isOverflow ? "none" : `${MAX_HEIGHT}px` }}
          >
            <span className="text-(length:--chat-body-size) leading-(--chat-body-leading) text-[#ececec] antialiased whitespace-pre-wrap wrap-break-word">
              {content}
            </span>
            {isOverflow && !isExpanded ? (
              <div
                className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
                style={{ background: "linear-gradient(to top, color-mix(in oklab, var(--primary) 10%, var(--background)), transparent)" }}
              />
            ) : null}
          </div>
          {isOverflow ? (
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="flex items-center gap-1 mt-1 text-xs text-primary/70 hover:text-primary transition-colors cursor-pointer self-start border-0 bg-transparent p-0 font-[inherit]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                {isExpanded ? (
                  <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
              {isExpanded ? "Show less" : "Show more"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
