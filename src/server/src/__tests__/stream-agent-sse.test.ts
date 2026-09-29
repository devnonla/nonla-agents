import { describe, expect, test } from "bun:test";
import type { SSEStreamingApi } from "hono/streaming";
import { messagesFromUpdateValue, streamAgentSSE } from "../common/ai/stream-agent-sse.js";

function collectStream() {
  const events: Record<string, unknown>[] = [];
  const stream = {
    writeSSE: async (sse: { data: string }) => {
      events.push(JSON.parse(sse.data) as Record<string, unknown>);
    },
  } as unknown as SSEStreamingApi;
  return { events, stream };
}

function toolMsg(id: string, name: string, content: string) {
  return {
    type: "tool",
    name,
    tool_call_id: id,
    content,
    _getType: () => "tool",
  };
}

async function* chunksOf(chunks: unknown[]) {
  for (const chunk of chunks) yield chunk;
}

function fakeAgent(chunks: unknown[]) {
  return {
    stream: async () => chunksOf(chunks),
  };
}

describe("messagesFromUpdateValue", () => {
  test("reads { messages }, arrays, and a bare tool message", () => {
    const msg = toolMsg("tc1", "run_current_script", "{}");
    expect(messagesFromUpdateValue({ messages: [msg] })).toEqual([msg]);
    expect(messagesFromUpdateValue([msg])).toEqual([msg]);
    expect(messagesFromUpdateValue(msg)).toEqual([msg]);
    expect(messagesFromUpdateValue(null)).toEqual([]);
  });
});

describe("streamAgentSSE", () => {
  test("emits tool-result from messages-mode ToolMessage", async () => {
    const { events, stream } = collectStream();
    await streamAgentSSE({
      agent: fakeAgent([
        [
          "messages",
          [
            {
              type: "AIMessageChunk",
              tool_call_chunks: [{ id: "tc1", name: "run_current_script", args: '{"keywords":["test"]}' }],
            },
            {},
          ],
        ],
        ["messages", [toolMsg("tc1", "run_current_script", JSON.stringify({ success: true, output: { n: 1 } })), {}]],
      ]),
      messages: [],
      stream,
    });

    expect(events.filter((e) => e.type === "tool-call")).toHaveLength(1);
    const result = events.find((e) => e.type === "tool-result");
    expect(result).toMatchObject({
      type: "tool-result",
      toolCallId: "tc1",
      toolName: "run_current_script",
      result: { success: true, output: { n: 1 } },
    });
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  test("emits tool-result from updates payload that is a message array", async () => {
    const { events, stream } = collectStream();
    await streamAgentSSE({
      agent: fakeAgent([
        [
          "messages",
          [
            {
              type: "AIMessageChunk",
              tool_call_chunks: [{ id: "tc1", name: "run_current_script", args: "{}" }],
            },
            {},
          ],
        ],
        ["updates", { tools: [toolMsg("tc1", "run_current_script", JSON.stringify({ success: true, output: "ok" }))] }],
      ]),
      messages: [],
      stream,
    });

    expect(events.find((e) => e.type === "tool-result")).toMatchObject({
      toolCallId: "tc1",
      result: { success: true, output: "ok" },
    });
  });

  test("re-emits the same toolCallId from updates with full args (client upserts — no ghost error)", async () => {
    const { events, stream } = collectStream();
    await streamAgentSSE({
      agent: fakeAgent([
        [
          "messages",
          [
            {
              type: "AIMessageChunk",
              tool_call_chunks: [{ id: "tc1", name: "edit_skill_file", args: "{" }],
            },
            {},
          ],
        ],
        [
          "updates",
          {
            agent: {
              messages: [
                {
                  type: "AIMessage",
                  tool_calls: [{ id: "tc1", name: "edit_skill_file", args: { path: "SKILL.md", mode: "full", content: "# Skill\n" } }],
                  _getType: () => "ai",
                },
              ],
            },
          },
        ],
        ["updates", { tools: [toolMsg("tc1", "edit_skill_file", JSON.stringify({ ok: true, path: "SKILL.md" }))] }],
      ]),
      messages: [],
      stream,
    });

    const calls = events.filter((e) => e.type === "tool-call");
    expect(calls).toHaveLength(2);
    expect(calls.every((e) => e.toolCallId === "tc1")).toBe(true);
    expect(calls[1]?.input).toEqual({ path: "SKILL.md", mode: "full", content: "# Skill\n" });
    const results = events.filter((e) => e.type === "tool-result");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ toolCallId: "tc1", result: { ok: true, path: "SKILL.md" } });
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  test("maps a later updates tool-call with a different id onto the early chunk id", async () => {
    const { events, stream } = collectStream();
    await streamAgentSSE({
      agent: fakeAgent([
        [
          "messages",
          [
            {
              type: "AIMessageChunk",
              tool_call_chunks: [{ id: "chunk-1", name: "read_skill_file", args: "{}" }],
            },
            {},
          ],
        ],
        [
          "updates",
          {
            agent: {
              messages: [
                {
                  type: "AIMessage",
                  tool_calls: [{ id: "final-9", name: "read_skill_file", args: { path: "SKILL.md" } }],
                  _getType: () => "ai",
                },
              ],
            },
          },
        ],
        ["updates", { tools: [toolMsg("final-9", "read_skill_file", JSON.stringify({ ok: true, path: "SKILL.md" }))] }],
      ]),
      messages: [],
      stream,
    });

    const calls = events.filter((e) => e.type === "tool-call");
    expect(calls.map((e) => e.toolCallId)).toEqual(["chunk-1", "chunk-1"]);
    expect(calls[1]?.input).toEqual({ path: "SKILL.md" });
    const results = events.filter((e) => e.type === "tool-result");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ toolCallId: "chunk-1", result: { ok: true, path: "SKILL.md" } });
  });

  test("flushes unresolved tool-calls when the stream ends without a result", async () => {
    const { events, stream } = collectStream();
    await streamAgentSSE({
      agent: fakeAgent([
        [
          "messages",
          [
            {
              type: "AIMessageChunk",
              tool_call_chunks: [{ id: "tc1", name: "run_current_script", args: "{}" }],
            },
            {},
          ],
        ],
      ]),
      messages: [],
      stream,
    });

    const result = events.find((e) => e.type === "tool-result");
    expect(result).toMatchObject({
      type: "tool-result",
      toolCallId: "tc1",
      toolName: "run_current_script",
      result: { success: false, error: "Tool did not return a result" },
    });
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });
});
