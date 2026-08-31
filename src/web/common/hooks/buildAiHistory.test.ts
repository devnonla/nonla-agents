import { describe, expect, test } from "bun:test";
import type { ChatAgentMessage } from "src/components/chat/common/types";
import { buildAiHistory } from "./useAssistantStreaming";

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
