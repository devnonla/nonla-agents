import { describe, expect, test } from "bun:test";
import type { ChatAgentMessage } from "src/components/chat/common/types";
import { buildAiHistory, failOpenToolCalls } from "./useAssistantStreaming";

describe("buildAiHistory", () => {
  test("drops uiOnly, empty assistant, incomplete tool-calls, and thinking", () => {
    const messages: ChatAgentMessage[] = [
      { id: "u1", role: "user", content: "hi", timestamp: new Date() },
      { id: "a0", role: "assistant", content: "   ", timestamp: new Date() },
      { id: "t1", role: "thinking", content: "reason", timestamp: new Date() },
      {
        id: "tc0",
        role: "tool-call",
        content: "",
        toolName: "browser",
        timestamp: new Date(),
      },
      {
        id: "tc1",
        role: "tool-call",
        content: "",
        toolName: "browser",
        toolOutput: "ok",
        timestamp: new Date(),
      },
      {
        id: "sum",
        role: "assistant",
        content: "Here's what I did",
        timestamp: new Date(),
        meta: { uiOnly: true },
      },
      { id: "a1", role: "assistant", content: "done", timestamp: new Date() },
    ];

    const history = buildAiHistory(messages);
    expect(history).toEqual([
      { role: "user", content: "hi" },
      {
        role: "tool-call",
        content: "",
        toolCallId: undefined,
        toolName: "browser",
        toolInput: undefined,
        toolOutput: "ok",
      },
      { role: "assistant", content: "done" },
    ]);
  });
});

describe("failOpenToolCalls", () => {
  test("fails tool bubbles that never received a result", () => {
    const open: ChatAgentMessage = {
      id: "tc0",
      role: "tool-call",
      content: "run_current_script",
      toolName: "run_current_script",
      timestamp: new Date(),
    };
    const done: ChatAgentMessage = {
      id: "tc1",
      role: "tool-call",
      content: "edit_code",
      toolName: "edit_code",
      toolOutput: '{"ok":true}',
      timestamp: new Date(),
    };
    const next = failOpenToolCalls([open, done], "Cancelled");
    expect(next[0].toolError).toBe(true);
    expect(next[0].toolOutput).toContain("Cancelled");
    expect(next[1].toolOutput).toBe('{"ok":true}');
    expect(next[1].toolError).toBeUndefined();
  });
});
