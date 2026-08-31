/**
 * Conversation history compaction — keep a recent window and summarize older turns.
 */

import { eq } from "drizzle-orm";
import { agentConversations, getDb } from "../../../../common/db/client.js";
import type { MessageParam } from "./agentRunner.js";

/** Start compacting once history exceeds this many MessageParam entries. */
export const HISTORY_COMPACT_TRIGGER = 80;
/** Keep this many most recent MessageParam entries verbatim. */
export const HISTORY_RECENT_WINDOW = 50;
/** Max chars for the extractive summary block. */
export const HISTORY_SUMMARY_MAX_CHARS = 3000;

function messageText(m: MessageParam): string | null {
  if (m.role === "user") return m.content.trim();
  if (m.role === "assistant" && !("toolCalls" in m)) return m.content.trim();
  return null;
}

export function buildExtractiveSummary(older: MessageParam[], maxChars = HISTORY_SUMMARY_MAX_CHARS): string {
  const bullets: string[] = [];
  let chars = 0;

  for (const m of older) {
    const text = messageText(m);
    if (!text) continue;
    const role = m.role === "user" ? "User" : "Assistant";
    const clipped = text.length > 280 ? `${text.slice(0, 277)}…` : text;
    const line = `- ${role}: ${clipped}`;
    if (chars + line.length + 1 > maxChars) break;
    bullets.push(line);
    chars += line.length + 1;
  }

  if (bullets.length === 0) return "(No earlier textual turns to summarize.)";
  return bullets.join("\n");
}

export function compactMessageParams(messages: MessageParam[]): {
  messages: MessageParam[];
  compacted: boolean;
  summary: string | null;
} {
  if (messages.length <= HISTORY_COMPACT_TRIGGER) {
    return { messages, compacted: false, summary: null };
  }

  const recent = messages.slice(-HISTORY_RECENT_WINDOW);
  const older = messages.slice(0, -HISTORY_RECENT_WINDOW);
  const summary = buildExtractiveSummary(older);

  return {
    compacted: true,
    summary,
    messages: [
      {
        role: "user",
        content: `<conversation_summary>
Earlier turns in this conversation were compacted. Use this summary plus the recent messages that follow.

${summary}
</conversation_summary>`,
      },
      ...recent,
    ],
  };
}

/** Load path helper — compact and optionally persist summary on the conversation. */
export function applyHistoryCompaction(conversationId: string, messages: MessageParam[]): MessageParam[] {
  const { messages: next, compacted, summary } = compactMessageParams(messages);
  if (compacted && summary) {
    try {
      getDb().update(agentConversations).set({ summary, summaryUpdatedAt: new Date() }).where(eq(agentConversations.id, conversationId)).run();
    } catch {
      /* best-effort */
    }
  }
  return next;
}
