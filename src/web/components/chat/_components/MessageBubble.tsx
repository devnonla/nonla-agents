import { ChatError, ChatThinking, ChatUserMessage } from "@nonla-agents/ui";
import type { ChatAgentMessage } from "../common/types";
import { MessageAgent } from "./MessageAgent";
import { ToolCallBubble } from "./ToolCallBubble";

interface MessageBubbleProps {
  msg: ChatAgentMessage;
  assistantLabel?: string;
  assistantColor?: string | null;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  isFirstInAgentChain?: boolean;
}

export function MessageBubble({ msg, assistantLabel = "Assistant", assistantColor, isFirstInGroup = true, isLastInGroup = true, isFirstInAgentChain = true }: MessageBubbleProps) {
  if (msg.role === "tool-call") return <ToolCallBubble msg={msg} assistantLabel={assistantLabel} assistantColor={assistantColor} showAvatar={isFirstInAgentChain} />;
  if (msg.role === "tool-result") return null;

  if (msg.role === "thinking") {
    const duration = (msg.meta?.thinkingDuration as number) ?? 0;
    return <ChatThinking thinking={msg.content} duration={duration} className="animate-fadeIn mt-1" />;
  }

  if (msg.role === "error") {
    return <ChatError className="animate-fadeIn">{msg.content}</ChatError>;
  }

  if (msg.role === "user") return <ChatUserMessage content={msg.content} className="animate-fadeIn" />;

  return <MessageAgent msg={msg} isFirstInGroup={isFirstInGroup} isLastInGroup={isLastInGroup} />;
}
