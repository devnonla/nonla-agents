import type { ChatAgentMessage } from "src/components/chat/common/types";

/** Get or create a persistent device fingerprint (survives across sessions). */
export function getFingerprint(): string {
  const key = "__device_fp";
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem(key, fp);
  }
  return fp;
}

/** Internal tools that should not be shown to end users in public chat. */
export const HIDDEN_TOOL_NAMES = new Set<string>();

/** Convert a raw AgentMessage to the display format used by MessageBubble. */
export function toDisplayMsg(m: any): ChatAgentMessage {
  if (m.role === "tool") {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    return {
      id: m.id,
      role: "tool-call" as const,
      content: String(meta.toolName ?? m.content ?? "tool"),
      toolName: String(meta.toolName ?? m.content ?? "Tool"),
      toolLabel: meta.toolLabel as string | undefined,
      toolIcon: (meta.toolIcon as string | null | undefined) ?? null,
      toolInput: meta.toolInput,
      toolOutput: meta.toolOutput as string | undefined,
      toolError: Boolean(meta.toolError),
      streaming: false,
      timestamp: m.createdAt ?? new Date(),
    };
  }
  if (m.role === "thinking") {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    return {
      id: m.id,
      role: "thinking" as const,
      content: m.content,
      streaming: false,
      timestamp: m.createdAt ?? new Date(),
      meta: { thinking: m.content, thinkingDuration: (meta.thinkingDuration as number) ?? 0 },
    };
  }
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    streaming: false,
    timestamp: m.createdAt ?? new Date(),
    meta: m.metadata ? (m.metadata as Record<string, unknown>) : undefined,
  };
}
