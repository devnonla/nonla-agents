/**
 * Mid-step compact for coding agents: before each model call, redact older edit_*
 * payloads and keep only the latest successful snapshot per toolName.
 * Also redacts heavy args on the latest call (snapshot lives in ToolMessage).
 */

import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { createMiddleware } from "langchain";
import { EDIT_PAYLOAD_OMITTED } from "./apply-exact-replace.js";

export const CODING_EDIT_TOOL_NAMES = new Set(["edit_code", "edit_ui", "edit_styles", "edit_backend", "edit_deps", "edit_skill_file"]);

const HEAVY_ARG_KEYS = ["code", "content", "edits"] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function redactArgs(args: unknown): Record<string, unknown> {
  const input = isRecord(args) ? { ...args } : {};
  for (const key of HEAVY_ARG_KEYS) {
    if (key in input) {
      input[key] = EDIT_PAYLOAD_OMITTED;
    }
  }
  return input;
}

function parseToolResult(content: unknown): { ok?: boolean; raw: string } {
  const raw = typeof content === "string" ? content : content == null ? "" : String(content);
  try {
    const parsed = JSON.parse(raw) as { ok?: boolean };
    return { ok: typeof parsed.ok === "boolean" ? parsed.ok : undefined, raw };
  } catch {
    return { raw };
  }
}

function redactToolResultContent(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next = { ...parsed };
    if ("current_code" in next) next.current_code = EDIT_PAYLOAD_OMITTED;
    if ("content" in next) next.content = EDIT_PAYLOAD_OMITTED;
    if ("current_draft" in next) next.current_draft = EDIT_PAYLOAD_OMITTED;
    return JSON.stringify(next);
  } catch {
    return EDIT_PAYLOAD_OMITTED;
  }
}

type EditOccurrence = {
  toolCallId: string;
  toolName: string;
  aiIndex: number;
  toolIndex: number;
  ok: boolean;
};

function collectEditOccurrences(messages: BaseMessage[]): EditOccurrence[] {
  const out: EditOccurrence[] = [];
  const toolMsgById = new Map<string, { index: number; ok: boolean }>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (ToolMessage.isInstance(msg)) {
      const id = msg.tool_call_id;
      const { ok } = parseToolResult(msg.content);
      if (id) toolMsgById.set(id, { index: i, ok: ok === true });
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!AIMessage.isInstance(msg) || !msg.tool_calls?.length) continue;
    for (const tc of msg.tool_calls) {
      const name = tc.name ?? "";
      if (!CODING_EDIT_TOOL_NAMES.has(name)) continue;
      const id = tc.id;
      if (!id) continue;
      const tool = toolMsgById.get(id);
      if (!tool) continue;
      out.push({
        toolCallId: id,
        toolName: name,
        aiIndex: i,
        toolIndex: tool.index,
        ok: tool.ok,
      });
    }
  }
  return out;
}

/** Latest successful edit per toolName; if none succeeded, latest call overall per name. */
function latestKeepIds(occurrences: EditOccurrence[]): Set<string> {
  const byName = new Map<string, EditOccurrence[]>();
  for (const o of occurrences) {
    const list = byName.get(o.toolName) ?? [];
    list.push(o);
    byName.set(o.toolName, list);
  }
  const keep = new Set<string>();
  for (const list of byName.values()) {
    const lastOk = [...list].reverse().find((o) => o.ok);
    const chosen = lastOk ?? list[list.length - 1];
    if (chosen) keep.add(chosen.toolCallId);
  }
  return keep;
}

export function compactEditMessagesInPlace(messages: BaseMessage[]): BaseMessage[] {
  const occurrences = collectEditOccurrences(messages);
  if (occurrences.length === 0) return messages;

  const keepIds = latestKeepIds(occurrences);
  // Only redact superseded successful snapshots — keep failed results so the model can see errors
  const redactOutputIds = new Set(occurrences.filter((o) => o.ok && !keepIds.has(o.toolCallId)).map((o) => o.toolCallId));
  const allEditIds = new Set(occurrences.map((o) => o.toolCallId));

  return messages.map((msg) => {
    if (AIMessage.isInstance(msg) && msg.tool_calls?.length) {
      let changed = false;
      const tool_calls = msg.tool_calls.map((tc) => {
        if (!tc.id || !allEditIds.has(tc.id)) return tc;
        // Always redact heavy args (including latest) — snapshot lives in ToolMessage
        changed = true;
        return { ...tc, args: redactArgs(tc.args) };
      });
      if (!changed) return msg;
      return new AIMessage({
        content: msg.content,
        tool_calls,
        id: msg.id,
        additional_kwargs: msg.additional_kwargs,
        response_metadata: msg.response_metadata,
      });
    }

    if (ToolMessage.isInstance(msg)) {
      const id = msg.tool_call_id;
      if (!id || !redactOutputIds.has(id)) return msg;
      const raw = typeof msg.content === "string" ? msg.content : String(msg.content ?? "");
      return new ToolMessage({
        content: redactToolResultContent(raw),
        tool_call_id: id,
        name: msg.name,
        id: msg.id,
        additional_kwargs: msg.additional_kwargs,
        response_metadata: msg.response_metadata,
      });
    }

    return msg;
  });
}

export function createCompactEditMiddleware() {
  return createMiddleware({
    name: "CompactEditPayloads",
    wrapModelCall: (request, handler) => {
      const req = request as { messages?: BaseMessage[]; state?: { messages?: BaseMessage[] } };
      const source = Array.isArray(req.messages) && req.messages.length > 0 ? req.messages : Array.isArray(req.state?.messages) && req.state.messages.length > 0 ? req.state.messages : null;
      if (!source) return handler(request);
      const compacted = compactEditMessagesInPlace(source);
      return handler({ ...request, messages: compacted });
    },
  });
}

function latestKeepOutputIndexes(messages: Array<{ role: string; toolName?: string; toolOutput?: string }>): Set<number> {
  const byName = new Map<string, number[]>();
  messages.forEach((m, i) => {
    if (m.role !== "tool-call" || !m.toolName || !CODING_EDIT_TOOL_NAMES.has(m.toolName)) return;
    const list = byName.get(m.toolName) ?? [];
    list.push(i);
    byName.set(m.toolName, list);
  });
  const keep = new Set<number>();
  for (const indexes of byName.values()) {
    const lastOk = [...indexes].reverse().find((i) => parseToolResult(messages[i]?.toolOutput).ok === true);
    keep.add(lastOk ?? indexes[indexes.length - 1]!);
  }
  return keep;
}

/**
 * Cross-turn history: redact edit args always.
 * Keeps the newest successful snapshot per tool by default so the model is not
 * left with only `[omitted…]` and then writes that string into a file.
 * Pass `keepLatestOutput: false` to redact every snapshot.
 */
export function redactEditHistoryPayloads<T extends { role: string; toolName?: string; toolInput?: unknown; toolOutput?: string }>(messages: T[], omitted = EDIT_PAYLOAD_OMITTED, opts?: { keepLatestOutput?: boolean }): T[] {
  const keepOutput = opts?.keepLatestOutput === false ? new Set<number>() : latestKeepOutputIndexes(messages);
  return messages.map((m, i) => {
    if (m.role !== "tool-call" || !m.toolName || !CODING_EDIT_TOOL_NAMES.has(m.toolName)) return m;
    const input = isRecord(m.toolInput) ? { ...m.toolInput } : {};
    let inputChanged = false;
    for (const key of HEAVY_ARG_KEYS) {
      if (key in input) {
        input[key] = omitted;
        inputChanged = true;
      }
    }
    let toolOutput = m.toolOutput;
    if (typeof toolOutput === "string" && toolOutput.length > 0 && !keepOutput.has(i)) {
      toolOutput = redactToolResultContent(toolOutput);
    }
    if (!inputChanged && toolOutput === m.toolOutput) return m;
    return {
      ...m,
      toolInput: inputChanged ? input : m.toolInput,
      toolOutput,
    };
  });
}
