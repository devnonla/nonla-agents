import { describe, expect, test } from "bun:test";
import { rebuildHistoryFromRows } from "../modules/agents/runtime/utils/loadHistory.js";

describe("rebuildHistoryFromRows", () => {
  test("pairs assistant + following tools", () => {
    const history = rebuildHistoryFromRows([
      { role: "user", content: "hi", metadata: null },
      { role: "assistant", content: "let me check", metadata: null },
      {
        role: "tool",
        content: "browser",
        metadata: { toolCallId: "tc1", toolName: "browser", toolInput: { url: "https://x" }, toolOutput: "ok" },
      },
      { role: "assistant", content: "done", metadata: null },
    ]);

    expect(history).toEqual([
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "let me check",
        toolCalls: [{ id: "tc1", name: "browser", args: { url: "https://x" } }],
      },
      { role: "tool-result", toolCallId: "tc1", toolName: "browser", result: "ok" },
      { role: "assistant", content: "done" },
    ]);
  });

  test("synthesizes assistant for orphan tool rows (no text before tool call)", () => {
    const history = rebuildHistoryFromRows([
      { role: "user", content: "search", metadata: null },
      {
        role: "tool",
        content: "browser",
        metadata: { toolCallId: "tc1", toolName: "browser", toolInput: {}, toolOutput: "result" },
      },
      { role: "assistant", content: "here", metadata: null },
    ]);

    expect(history).toEqual([
      { role: "user", content: "search" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "browser", args: {} }],
      },
      { role: "tool-result", toolCallId: "tc1", toolName: "browser", result: "result" },
      { role: "assistant", content: "here" },
    ]);
  });

  test("skips thinking between assistant and tools", () => {
    const history = rebuildHistoryFromRows([
      { role: "user", content: "q", metadata: null },
      { role: "assistant", content: "", metadata: null },
      { role: "thinking", content: "hmm", metadata: { thinkingDuration: 1 } },
      {
        role: "tool",
        content: "get_current_time",
        metadata: { toolCallId: "tc1", toolName: "get_current_time", toolInput: {}, toolOutput: "now" },
      },
      { role: "assistant", content: "answer", metadata: null },
    ]);

    expect(history[1]).toEqual({
      role: "assistant",
      content: "",
      toolCalls: [{ id: "tc1", name: "get_current_time", args: {} }],
    });
    expect(history[2]).toEqual({
      role: "tool-result",
      toolCallId: "tc1",
      toolName: "get_current_time",
      result: "now",
    });
    expect(history[3]).toEqual({ role: "assistant", content: "answer" });
  });

  test("keeps assistant text between consecutive tool rows", () => {
    const history = rebuildHistoryFromRows([
      { role: "user", content: "do both", metadata: null },
      { role: "assistant", content: "I'll update meta first", metadata: null },
      {
        role: "tool",
        content: "edit_code",
        metadata: { toolCallId: "t1", toolName: "edit_code", toolInput: {}, toolOutput: "ok" },
      },
      { role: "assistant", content: "Now I'll edit the script", metadata: null },
      {
        role: "tool",
        content: "edit_code",
        metadata: { toolCallId: "t2", toolName: "edit_code", toolInput: {}, toolOutput: "ok" },
      },
      { role: "assistant", content: "done", metadata: null },
    ]);

    expect(history).toEqual([
      { role: "user", content: "do both" },
      {
        role: "assistant",
        content: "I'll update meta first",
        toolCalls: [{ id: "t1", name: "edit_code", args: {} }],
      },
      { role: "tool-result", toolCallId: "t1", toolName: "edit_code", result: "ok" },
      {
        role: "assistant",
        content: "Now I'll edit the script",
        toolCalls: [{ id: "t2", name: "edit_code", args: {} }],
      },
      { role: "tool-result", toolCallId: "t2", toolName: "edit_code", result: "ok" },
      { role: "assistant", content: "done" },
    ]);
  });

  test("groups multiple orphan tools into one assistant tool_calls", () => {
    const history = rebuildHistoryFromRows([
      { role: "user", content: "go", metadata: null },
      {
        role: "tool",
        content: "a",
        metadata: { toolCallId: "1", toolName: "a", toolInput: { x: 1 }, toolOutput: "ra" },
      },
      {
        role: "tool",
        content: "b",
        metadata: { toolCallId: "2", toolName: "b", toolInput: { y: 2 }, toolOutput: "rb" },
      },
      { role: "assistant", content: "ok", metadata: null },
    ]);

    expect(history[1]).toMatchObject({
      role: "assistant",
      content: "",
      toolCalls: [
        { id: "1", name: "a", args: { x: 1 } },
        { id: "2", name: "b", args: { y: 2 } },
      ],
    });
    expect(history).toHaveLength(5);
  });
});
