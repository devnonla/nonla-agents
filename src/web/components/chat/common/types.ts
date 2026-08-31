// ── ChatAgent shared types ────────────────────────────────────────────────────

/** Role set supported by ChatAgent */
export type ChatAgentRole = "user" | "assistant" | "tool-call" | "tool-result" | "error" | (string & {}); // allow consumer-defined roles (e.g. "review")

export interface ChatAgentMessage {
  id: string;
  role: ChatAgentRole;
  content: string;
  /** Tool call ID from the model — used to match tool-result to tool-call */
  toolCallId?: string;
  /** Tool name (internal key) — for tool-call / tool-result bubbles */
  toolName?: string;
  /** Human-readable label for the tool (e.g. "Tìm kiếm Web") */
  toolLabel?: string;
  /** Custom tool SVG icon markup (Iconify Lucide) */
  toolIcon?: string | null;
  /** Raw tool input params */
  toolInput?: unknown;
  /** Raw tool output / result */
  toolOutput?: string;
  /** True when tool execution failed */
  toolError?: boolean;
  /** True while the AI is streaming this message */
  streaming?: boolean;
  timestamp: Date;
  // ── Extension slot — consumers can attach arbitrary metadata ──────────
  meta?: Record<string, unknown>;
}
