import { describe, expect, test } from "bun:test";
import { extractAiMessageText, unstreamedTextRemainder } from "../common/ai/ai-message-text.js";

describe("extractAiMessageText", () => {
  test("string content", () => {
    expect(extractAiMessageText("hello")).toBe("hello");
  });

  test("text and output_text blocks", () => {
    expect(
      extractAiMessageText([
        { type: "text", text: "hello " },
        { type: "output_text", text: "world" },
        { type: "thinking", thinking: "skip" },
      ]),
    ).toBe("hello world");
  });

  test("empty and unknown", () => {
    expect(extractAiMessageText(null)).toBe("");
    expect(extractAiMessageText([])).toBe("");
    expect(extractAiMessageText({ text: "nope" })).toBe("");
  });
});

describe("unstreamedTextRemainder", () => {
  test("returns suffix when complete message is longer than streamed deltas", () => {
    expect(unstreamedTextRemainder("tránh trùng lặp", "tránh tr")).toBe("ùng lặp");
  });

  test("returns full text when nothing was streamed", () => {
    expect(unstreamedTextRemainder("hello", "")).toBe("hello");
  });

  test("returns empty when already complete or not a prefix", () => {
    expect(unstreamedTextRemainder("hello", "hello")).toBe("");
    expect(unstreamedTextRemainder("hello", "hello!")).toBe("");
    expect(unstreamedTextRemainder("world", "hello")).toBe("");
    expect(unstreamedTextRemainder("", "hello")).toBe("");
  });
});
