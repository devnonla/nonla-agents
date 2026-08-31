import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { UserAvatar } from "src/components/UserAvatar";
import type { ChatAgentMessage } from "../common/types";
import { Thinking } from "./Thinking";
import { type MarkdownStreamState, createMarkdownComponents, markdownRootClass } from "./markdown";

interface MessageAgentProps {
  msg: ChatAgentMessage;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
}

const DEFAULT_AGENT_COLOR = "#71717a";

/** AI assistant avatar — exported for reuse in ToolCallBubble & tool UIs */
export function AgentAvatar({
  color,
  avatar,
  name,
}: {
  color?: string | null;
  avatar?: string | null;
  name?: string | null;
}) {
  const c = color ?? DEFAULT_AGENT_COLOR;
  const bgStyle = {
    background: `${c}18`,
    border: `1px solid ${c}40`,
  };
  return (
    <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center overflow-hidden" style={bgStyle} aria-label="Assistant avatar">
      <UserAvatar avatar={avatar} name={name} size={28} />
    </div>
  );
}

export function MessageAgent({ msg }: MessageAgentProps) {
  const thinking = msg.meta?.thinking as string | undefined;
  const thinkingDuration = msg.meta?.thinkingDuration as number | undefined;
  const isThinkingDone = thinkingDuration != null;

  const streamStateRef = useRef<MarkdownStreamState>({ content: msg.content, streaming: !!msg.streaming });
  streamStateRef.current = { content: msg.content, streaming: !!msg.streaming };

  const componentsRef = useRef<ReturnType<typeof createMarkdownComponents> | null>(null);
  if (!componentsRef.current) {
    componentsRef.current = createMarkdownComponents(() => streamStateRef.current);
  }

  return (
    <div className="mt-1 animate-fadeIn">
      {thinking ? <Thinking thinking={thinking} duration={thinkingDuration ?? 0} streaming={!isThinkingDone} /> : null}
      {msg.content ? (
        <div className="min-w-0 px-4 pb-0.5">
          <div className={markdownRootClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentsRef.current}>
              {msg.content}
            </ReactMarkdown>
          </div>
        </div>
      ) : null}
    </div>
  );
}
