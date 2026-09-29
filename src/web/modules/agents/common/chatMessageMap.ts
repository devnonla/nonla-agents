import type { AgentMessage as ChatUiMessage } from "devnonla-ui";
import type { AgentMessage } from "src/common/types";

/** Map a persisted DB message into the shape AgentChatbox expects for `initialMessages`. */
export function toChatUiMessage(m: AgentMessage): ChatUiMessage {
  if (m.role === "tool") {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    return {
      id: m.id,
      role: "tool-call",
      content: String(meta.toolName ?? m.content ?? "tool"),
      toolCallId: meta.toolCallId as string | undefined,
      toolName: String(meta.toolName ?? m.content ?? "Tool"),
      toolLabel: meta.toolLabel as string | undefined,
      toolInput: meta.toolInput,
      toolOutput: meta.toolOutput,
      toolError: Boolean(meta.toolError),
      streaming: false,
      timestamp: m.createdAt ?? new Date(),
    };
  }

  if (m.role === "thinking") {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    return {
      id: m.id,
      role: "thinking",
      content: m.content,
      streaming: false,
      timestamp: m.createdAt ?? new Date(),
      meta: { thinking: m.content, thinkingDuration: (meta.thinkingDuration as number) ?? 0 },
    };
  }

  return {
    id: m.id,
    role: m.role,
    content: m.content,
    streaming: false,
    timestamp: m.createdAt ?? new Date(),
    meta: m.metadata ? (m.metadata as ChatUiMessage["meta"]) : undefined,
  };
}
