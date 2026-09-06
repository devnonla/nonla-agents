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
