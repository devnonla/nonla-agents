import { ChatAgentMessage, ChatMarkdown } from "@nonla-agents/ui";
import { UserAvatar } from "src/components/UserAvatar";
import type { ChatAgentMessage as ChatAgentMessageData } from "../common/types";

interface MessageAgentProps {
  msg: ChatAgentMessageData;
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

  return (
    <ChatAgentMessage thinking={thinking} thinkingDuration={thinkingDuration ?? 0} thinkingStreaming={!isThinkingDone} className="animate-fadeIn">
      {msg.content ? <ChatMarkdown content={msg.content} streaming={!!msg.streaming} /> : null}
    </ChatAgentMessage>
  );
}
