import { describe, expect, test } from "bun:test";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { applyEdits, applyExactReplace, normalizeToLf } from "../common/ai/apply-exact-replace.js";
import { compactEditMessagesInPlace, redactEditHistoryPayloads } from "../common/ai/compact-edit-middleware.js";
import { buildLangChainMessages as buildSiteMessages, compactSiteWriteHistory, toolCallArgs as siteToolCallArgs } from "../modules/sites/services/site-agent.service.js";
import { buildLangChainMessages as buildCodingMessages, toolCallArgs as codingToolCallArgs, compactGenerateCodeHistory } from "../modules/tools/services/coding-agent.service.js";

describe("toolCallArgs", () => {
  test("accepts plain objects only", () => {
    expect(siteToolCallArgs({ file: "app.tsx" })).toEqual({ file: "app.tsx" });
    expect(codingToolCallArgs({ code: "x" })).toEqual({ code: "x" });
    expect(siteToolCallArgs("not-an-object")).toEqual({});
    expect(siteToolCallArgs(["a"])).toEqual({});
    expect(siteToolCallArgs(null)).toEqual({});
    expect(siteToolCallArgs(undefined)).toEqual({});
  });
});

describe("applyEdits", () => {
  test("exact replace", () => {
    const r = applyExactReplace("hello world", "world", "there");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toBe("hello there");
  });

  test("EOL normalize on content and needle", () => {
    const r = applyExactReplace("line1\r\nline2\r\n", "line1\nline2", "ok");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toBe("ok\n");
  });

  test("trailing whitespace flexible match", () => {
    const src = "  foo  \nbar\n";
    const r = applyExactReplace(src, "  foo\nbar", "baz");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toBe("baz\n");
  });

  test("ambiguous without replace_all", () => {
    const r = applyExactReplace("a x a", "a", "b");
    expect(r.ok).toBe(false);
  });

  test("replace_all", () => {
    const r = applyExactReplace("a x a", "a", "b", true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toBe("b x b");
  });

  test("multi-hunk atomic rollback", () => {
    const r = applyEdits("one two three", [
      { old_string: "one", new_string: "ONE" },
      { old_string: "missing", new_string: "x" },
    ]);
    expect(r.ok).toBe(false);
  });

  test("multi-hunk success", () => {
    const r = applyEdits("one two three", [
      { old_string: "one", new_string: "ONE" },
      { old_string: "three", new_string: "THREE" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toBe("ONE two THREE");
  });

  test("no-op rejected", () => {
    const r = applyExactReplace("abc", "abc", "abc");
    expect(r.ok).toBe(false);
  });

  test("normalizeToLf", () => {
    expect(normalizeToLf("a\r\nb\rc")).toBe("a\nb\nc");
  });
});

describe("compactSiteWriteHistory", () => {
  test("redacts all edit_ui payloads including latest", () => {
    const messages = [
      { role: "user" as const, content: "edit" },
      {
        role: "tool-call" as const,
        content: "",
        toolName: "edit_ui",
        toolCallId: "w1",
        toolInput: { mode: "full", content: "v1" },
        toolOutput: JSON.stringify({ ok: true, content: "v1" }),
      },
      {
        role: "tool-call" as const,
        content: "",
        toolName: "check_site",
        toolCallId: "c1",
        toolInput: {},
        toolOutput: '{"ok":true}',
      },
      {
        role: "tool-call" as const,
        content: "",
        toolName: "edit_ui",
        toolCallId: "w2",
        toolInput: { mode: "full", content: "v2" },
        toolOutput: JSON.stringify({ ok: true, content: "v2" }),
      },
    ];

    const compacted = compactSiteWriteHistory(messages);
    const edits = compacted.filter((m) => m.role === "tool-call" && m.toolName === "edit_ui");
    expect(edits).toHaveLength(2);
    for (const e of edits) {
      const input = (e as { toolInput: { content: string } }).toolInput;
      expect(input.content).toContain("omitted");
      expect((e as { toolOutput: string }).toolOutput).toContain("omitted");
    }
    expect(compacted.some((m) => m.role === "tool-call" && m.toolName === "check_site")).toBe(true);
  });
});

describe("compactGenerateCodeHistory", () => {
  test("redacts all edit_code payloads including latest", () => {
    const messages = [
      {
        role: "tool-call" as const,
        content: "",
        toolName: "edit_code",
        toolCallId: "g1",
        toolInput: { mode: "full", code: "old()" },
        toolOutput: JSON.stringify({ ok: true, current_code: "old()" }),
      },
      {
        role: "tool-call" as const,
        content: "",
        toolName: "edit_code",
        toolCallId: "g2",
        toolInput: { mode: "full", code: "new()" },
        toolOutput: JSON.stringify({ ok: true, current_code: "new()" }),
      },
    ];

    const compacted = compactGenerateCodeHistory(messages);
    expect((compacted[0] as { toolInput: { code: string } }).toolInput.code).toContain("omitted");
    expect((compacted[1] as { toolInput: { code: string } }).toolInput.code).toContain("omitted");
    expect((compacted[1] as { toolOutput: string }).toolOutput).toContain("omitted");
  });
});

describe("compactEditMessagesInPlace mid-step", () => {
  test("keeps latest ok snapshot and redacts prior", () => {
    const messages = [
      new AIMessage({
        content: "",
        tool_calls: [{ id: "e1", name: "edit_code", args: { mode: "full", code: "v1" }, type: "tool_call" }],
      }),
      new ToolMessage({ content: JSON.stringify({ ok: true, current_code: "v1" }), tool_call_id: "e1" }),
      new AIMessage({
        content: "",
        tool_calls: [{ id: "e2", name: "edit_code", args: { mode: "full", code: "v2" }, type: "tool_call" }],
      }),
      new ToolMessage({ content: JSON.stringify({ ok: true, current_code: "v2" }), tool_call_id: "e2" }),
    ];

    const compacted = compactEditMessagesInPlace(messages);
    const t1 = compacted[1] as ToolMessage;
    const t2 = compacted[3] as ToolMessage;
    expect(String(t1.content)).toContain("omitted");
    expect(String(t2.content)).toContain("v2");
    expect(String(t2.content)).not.toContain("omitted");

    const a2 = compacted[2] as AIMessage;
    expect(a2.tool_calls?.[0]?.args?.code).toContain("omitted");
  });

  test("failed latest keeps prior ok snapshot and error text", () => {
    const messages = [
      new AIMessage({
        content: "",
        tool_calls: [{ id: "e1", name: "edit_ui", args: { mode: "full", content: "v1" }, type: "tool_call" }],
      }),
      new ToolMessage({ content: JSON.stringify({ ok: true, content: "v1" }), tool_call_id: "e1" }),
      new AIMessage({
        content: "",
        tool_calls: [
          {
            id: "e2",
            name: "edit_ui",
            args: { mode: "replace", edits: [{ old_string: "nope", new_string: "x" }] },
            type: "tool_call",
          },
        ],
      }),
      new ToolMessage({ content: JSON.stringify({ ok: false, error: "not found" }), tool_call_id: "e2" }),
    ];

    const compacted = compactEditMessagesInPlace(messages);
    expect(String((compacted[1] as ToolMessage).content)).toContain("v1");
    expect(String((compacted[1] as ToolMessage).content)).not.toContain("omitted");
    expect(String((compacted[3] as ToolMessage).content)).toContain("not found");
    expect(String((compacted[3] as ToolMessage).content)).not.toContain("omitted");
  });
});

describe("redactEditHistoryPayloads", () => {
  test("redacts edits array", () => {
    const out = redactEditHistoryPayloads([
      {
        role: "tool-call",
        toolName: "edit_code",
        toolInput: { mode: "replace", edits: [{ old_string: "a", new_string: "b" }] },
        toolOutput: JSON.stringify({ ok: true, current_code: "b" }),
      },
    ]);
    const input = out[0].toolInput as Record<string, unknown>;
    expect(String(input.edits)).toContain("omitted");
  });
});

describe("buildLangChainMessages", () => {
  test("site: orphan tool-call emits paired AIMessage + ToolMessage", () => {
    const result = buildSiteMessages([
      {
        role: "tool-call",
        content: "",
        toolCallId: "tc-1",
        toolName: "check_site",
        toolInput: "bad",
        toolOutput: undefined,
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(AIMessage);
    expect(result[1]).toBeInstanceOf(ToolMessage);
    const ai = result[0] as AIMessage;
    expect(ai.tool_calls?.[0]?.args).toEqual({});
    expect(ai.tool_calls?.[0]?.id).toBe("tc-1");
    expect((result[1] as ToolMessage).content).toBe("");
    expect((result[1] as ToolMessage).tool_call_id).toBe("tc-1");
  });

  test("coding: redacts then pairs tool results", () => {
    const result = buildCodingMessages([
      { role: "assistant", content: "updating" },
      {
        role: "tool-call",
        content: "",
        toolCallId: "g1",
        toolName: "edit_code",
        toolInput: { mode: "full", code: "old" },
        toolOutput: JSON.stringify({ ok: true, current_code: "old" }),
      },
    ]);

    expect(result[0]).toBeInstanceOf(AIMessage);
    expect(result[1]).toBeInstanceOf(ToolMessage);
    const ai = result[0] as AIMessage;
    expect(String(ai.tool_calls?.[0]?.args?.code)).toContain("omitted");
  });

  test("coding: non-object toolInput becomes empty args", () => {
    const result = buildCodingMessages([
      {
        role: "tool-call",
        content: "",
        toolCallId: "x",
        toolName: "browser",
        toolInput: ["oops"],
        toolOutput: "done",
      },
    ]);
    expect((result[0] as AIMessage).tool_calls?.[0]?.args).toEqual({});
  });
});
