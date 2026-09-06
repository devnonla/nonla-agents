import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { ChatThinking } from "./ChatThinking";

export type ChatAgentMessageProps = {
  /** Plain text fallback when `children` is omitted. */
  content?: string;
  /** Prefer passing rendered markdown / rich content as children. */
  children?: ReactNode;
  thinking?: string;
  thinkingDuration?: number;
  thinkingStreaming?: boolean;
  className?: string;
};

export function ChatAgentMessage({ content, children, thinking, thinkingDuration, thinkingStreaming, className }: ChatAgentMessageProps) {
  const body = children ?? (content ? <p className="m-0 whitespace-pre-wrap wrap-break-word">{content}</p> : null);

  return (
    <div className={cn("nonla-chat-agent mt-1", className)}>
      {thinking ? <ChatThinking thinking={thinking} duration={thinkingDuration ?? 0} streaming={thinkingStreaming} /> : null}
      {body ? (
        <div className="min-w-0 px-4 pb-0.5">
          <div className="nonla-chat-body text-(length:--chat-body-size) leading-(--chat-body-leading) text-[var(--nonla-ink)] antialiased">{body}</div>
        </div>
      ) : null}
    </div>
  );
}
