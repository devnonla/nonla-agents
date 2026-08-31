/**
 * Shared SSE protocol for agent streams (raw chat + prompt/coding assistants).
 *
 * Canonical event types:
 *   text-delta | thinking-delta | tool-call | tool-result | done | error
 *
 * Legacy aliases (`chunk`, `thinking`) are normalized for older servers.
 */

export type AgentSseEvent =
  | { type: "text-delta"; text: string }
  | { type: "thinking-delta"; text: string }
  | { type: "tool-call"; toolCallId?: string; toolName: string; toolLabel?: string; toolIcon?: string | null; input: unknown }
  | { type: "tool-result"; toolCallId?: string; toolName: string; result: unknown }
  | { type: "done"; text?: string; reason?: string }
  | { type: "error"; error: string };

export interface AgentSseCallbacks {
  onTextDelta: (text: string) => void;
  onThinkingDelta: (text: string) => void;
  onToolCall: (call: { toolCallId?: string; toolName: string; toolLabel?: string; toolIcon?: string | null; input: unknown }) => void;
  onToolResult: (call: { toolCallId?: string; toolName: string; result: unknown }) => void;
  onDone: (text: string) => void | Promise<void>;
  onError: (error: string) => void | Promise<void>;
}

export type ParseSseResult = "done" | "error" | "aborted" | "connection-lost";

/** Normalize raw JSON into a canonical AgentSseEvent (or null if unknown). */
export function normalizeSseEvent(raw: Record<string, unknown>): AgentSseEvent | null {
  const type = raw.type;
  // Keep-alive from server (Bun idleTimeout / proxies) — ignore
  if (type === "ping") return null;
  if (type === "text-delta" || type === "chunk") {
    return { type: "text-delta", text: String(raw.text ?? "") };
  }
  if (type === "thinking-delta" || type === "thinking") {
    return { type: "thinking-delta", text: String(raw.text ?? "") };
  }
  if (type === "tool-call") {
    return {
      type: "tool-call",
      toolCallId: raw.toolCallId as string | undefined,
      toolName: String(raw.toolName ?? "unknown"),
      toolLabel: raw.toolLabel as string | undefined,
      toolIcon: (raw.toolIcon as string | null | undefined) ?? null,
      input: raw.input,
    };
  }
  if (type === "tool-result") {
    return {
      type: "tool-result",
      toolCallId: raw.toolCallId as string | undefined,
      toolName: String(raw.toolName ?? "unknown"),
      result: raw.result,
    };
  }
  // Legacy context/token usage events — ignore until reintroduced
  if (type === "context-usage" || type === "token-usage") {
    return null;
  }
  if (type === "done") {
    return { type: "done", text: raw.text as string | undefined, reason: raw.reason as string | undefined };
  }
  if (type === "error") {
    return { type: "error", error: String(raw.error ?? "Unknown error") };
  }
  return null;
}

/**
 * Read an SSE body, dispatching normalized events to callbacks.
 * Stops on done/error. Surfaces "Connection lost" if the stream ends without a terminal event.
 */
export async function parseSseStream(body: ReadableStream<Uint8Array>, callbacks: AgentSseCallbacks, options?: { signal?: AbortSignal }): Promise<ParseSseResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let gotTerminal = false;
  let terminal: ParseSseResult = "connection-lost";

  const handleLine = async (line: string): Promise<boolean> => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return false;
    const jsonStr = trimmed.slice(5).trim();
    if (!jsonStr) return false;

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      return false;
    }

    const event = normalizeSseEvent(raw);
    if (!event) return false;

    switch (event.type) {
      case "text-delta":
        callbacks.onTextDelta(event.text);
        return false;
      case "thinking-delta":
        callbacks.onThinkingDelta(event.text);
        return false;
      case "tool-call":
        callbacks.onToolCall({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          toolLabel: event.toolLabel,
          toolIcon: event.toolIcon,
          input: event.input,
        });
        return false;
      case "tool-result":
        callbacks.onToolResult({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          result: event.result,
        });
        return false;
      case "done":
        gotTerminal = true;
        terminal = "done";
        await Promise.resolve(callbacks.onDone(event.text ?? ""));
        return true;
      case "error":
        gotTerminal = true;
        terminal = "error";
        await Promise.resolve(callbacks.onError(event.error));
        return true;
    }
  };

  try {
    while (true) {
      if (options?.signal?.aborted) return "aborted";

      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        for (const line of buffer.split("\n")) {
          if (await handleLine(line)) return terminal;
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (await handleLine(line)) return terminal;
      }
    }

    if (!gotTerminal && !options?.signal?.aborted) {
      await Promise.resolve(callbacks.onError("Connection lost"));
      return "connection-lost";
    }

    return gotTerminal ? terminal : "aborted";
  } catch (err) {
    if ((err as Error).name === "AbortError" || options?.signal?.aborted) return "aborted";
    await Promise.resolve(callbacks.onError((err as Error).message ?? "Stream read error"));
    return "error";
  }
}
