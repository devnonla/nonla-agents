import { eq, sql } from "drizzle-orm";
import { agentMessages, getDb } from "../../../../common/db/client.js";
import type { MessageParam } from "./agentRunner.js";
import { applyHistoryCompaction } from "./historyCompact.js";

type HistoryRow = {
  role: string;
  content: string;
  metadata: Record<string, unknown> | null;
};

function parseToolRow(row: HistoryRow): {
  toolCall: { id: string; name: string; args: unknown };
  toolResult: Extract<MessageParam, { role: "tool-result" }>;
} | null {
  const meta = row.metadata;
  if (!meta?.toolCallId || !meta?.toolName) return null;
  const toolCallId = meta.toolCallId as string;
  const toolName = meta.toolName as string;
  const output = (meta.toolOutput as string) ?? (meta.result != null ? JSON.stringify(meta.result) : row.content);
  return {
    toolCall: { id: toolCallId, name: toolName, args: meta.toolInput ?? {} },
    toolResult: { role: "tool-result", toolCallId, toolName, result: output },
  };
}

function collectToolGroup(
  rows: HistoryRow[],
  start: number,
): {
  toolCalls: Array<{ id: string; name: string; args: unknown }>;
  toolResults: Extract<MessageParam, { role: "tool-result" }>[];
  nextIndex: number;
} {
  const toolCalls: Array<{ id: string; name: string; args: unknown }> = [];
  const toolResults: Extract<MessageParam, { role: "tool-result" }>[] = [];
  let j = start;
  while (j < rows.length) {
    if (rows[j].role === "thinking") {
      j++;
      continue;
    }
    if (rows[j].role !== "tool") break;
    const parsed = parseToolRow(rows[j]);
    if (parsed) {
      toolCalls.push(parsed.toolCall);
      toolResults.push(parsed.toolResult);
    }
    j++;
  }
  return { toolCalls, toolResults, nextIndex: j };
}

export function rebuildHistoryFromRows(rows: HistoryRow[]): MessageParam[] {
  const result: MessageParam[] = [];
  let i = 0;

  while (i < rows.length) {
    const row = rows[i];

    if (row.role === "thinking") {
      i++;
      continue;
    }

    if (row.role === "user") {
      result.push({ role: "user", content: row.content });
      i++;
      continue;
    }

    if (row.role === "assistant") {
      const { toolCalls, toolResults, nextIndex } = collectToolGroup(rows, i + 1);
      if (toolCalls.length > 0) {
        result.push({ role: "assistant", content: row.content || "", toolCalls });
        result.push(...toolResults);
        i = nextIndex;
      } else {
        result.push({ role: "assistant", content: row.content });
        i++;
      }
      continue;
    }

    if (row.role === "tool") {
      const { toolCalls, toolResults, nextIndex } = collectToolGroup(rows, i);
      if (toolCalls.length > 0) {
        result.push({ role: "assistant", content: "", toolCalls });
        result.push(...toolResults);
      }
      i = nextIndex;
      continue;
    }

    i++;
  }

  return result;
}

/**
 * Load conversation history for the agent.
 * Long histories are compacted: older turns → extractive summary + recent window.
 */
export function loadHistory(conversationId: string): MessageParam[] {
  const rows = getDb().select().from(agentMessages).where(eq(agentMessages.conversationId, conversationId)).orderBy(sql`rowid`).all();

  const full = rebuildHistoryFromRows(
    rows.map((r) => ({
      role: r.role,
      content: r.content,
      metadata: r.metadata as Record<string, unknown> | null,
    })),
  );

  return applyHistoryCompaction(conversationId, full);
}
