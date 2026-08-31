import { AltArrowDownIcon } from "@solar-icons/react/dynamic/alt-arrow-down";
import { AltArrowUpIcon } from "@solar-icons/react/dynamic/alt-arrow-up";
import { useEffect, useRef, useState } from "react";
import type { ChatAgentMessage } from "../common/types";
import { chatBodyClass } from "./markdown";

const MAX_HEIGHT = 150;

interface MessageUserProps {
  msg: ChatAgentMessage;
}

export function MessageUser({ msg }: MessageUserProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      setIsOverflow(el.scrollHeight > MAX_HEIGHT);
    }
  }, [msg.content]);

  return (
    <div className="animate-fadeIn mt-5">
      {/* Message row */}
      <div className="flex items-start gap-3 px-3 pt-3 pb-2">
        {/* Left: tag + message */}
        <div className="flex-1 min-w-0 flex flex-col bg-primary/10 px-4 py-2.5 rounded-xl">
          {/* Message text */}
          <div ref={contentRef} className="relative overflow-hidden transition-[max-height] duration-300 ease-in-out" style={{ maxHeight: isExpanded || !isOverflow ? "none" : `${MAX_HEIGHT}px` }}>
            <span className={`${chatBodyClass} whitespace-pre-wrap wrap-break-word`}>{msg.content}</span>
            {/* Gradient fade overlay */}
            {isOverflow && !isExpanded && <div className="absolute bottom-0 left-0 right-0 h-10 bg-linear-to-t from-surface to-transparent pointer-events-none" />}
          </div>
          {/* Expand / Collapse button */}
          {isOverflow && (
            <button type="button" onClick={() => setIsExpanded((v) => !v)} className="flex items-center gap-1 mt-1 text-xs text-primary/70 hover:text-primary transition-colors cursor-pointer self-start">
              {isExpanded ? (
                <>
                  <AltArrowUpIcon className="size-3.5" />
                  Show less
                </>
              ) : (
                <>
                  <AltArrowDownIcon className="size-3.5" />
                  Show more
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
