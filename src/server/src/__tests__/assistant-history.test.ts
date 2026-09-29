import { describe, expect, test } from "bun:test";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { EDIT_PAYLOAD_OMITTED, applyEdits, applyExactReplace, editPayloadIsOmitted, normalizeToLf } from "../common/ai/apply-exact-replace.js";
import { buildLangChainMessages, toolCallArgs } from "../common/ai/build-langchain-messages.js";
import { compactEditMessagesInPlace, redactEditHistoryPayloads } from "../common/ai/compact-edit-middleware.js";
import { buildSiteAgentSystemPrompt } from "../modules/sites/common/site-agent-prompt.js";

describe("toolCallArgs", () => {
  test("accepts plain objects only", () => {
    expect(toolCallArgs({ file: "app.tsx" })).toEqual({ file: "app.tsx" });
    expect(toolCallArgs({ code: "x" })).toEqual({ code: "x" });
    expect(toolCallArgs("not-an-object")).toEqual({});
    expect(toolCallArgs(["a"])).toEqual({});
    expect(toolCallArgs(null)).toEqual({});
    expect(toolCallArgs(undefined)).toEqual({});
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

  test("editPayloadIsOmitted detects compact placeholder in code or hunks", () => {
    expect(editPayloadIsOmitted("ok")).toBe(false);
    expect(editPayloadIsOmitted(EDIT_PAYLOAD_OMITTED)).toBe(true);
    expect(editPayloadIsOmitted("body", [{ old_string: "a", new_string: EDIT_PAYLOAD_OMITTED }])).toBe(true);
  });

  test("normalizeToLf", () => {
    expect(normalizeToLf("a\r\nb\rc")).toBe("a\nb\nc");
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

  test("keeps latest ok snapshot per file for edit_site_files", () => {
    const messages = [
      new AIMessage({
        content: "",
        tool_calls: [{ id: "u1", name: "edit_site_files", args: { file: "app.tsx", mode: "full", content: "ui-v1" }, type: "tool_call" }],
      }),
      new ToolMessage({ content: JSON.stringify({ ok: true, file: "app.tsx", content: "ui-v1" }), tool_call_id: "u1" }),
      new AIMessage({
        content: "",
        tool_calls: [{ id: "s1", name: "edit_site_files", args: { file: "styles.css", mode: "full", content: "css-v1" }, type: "tool_call" }],
      }),
      new ToolMessage({ content: JSON.stringify({ ok: true, file: "styles.css", content: "css-v1" }), tool_call_id: "s1" }),
      new AIMessage({
        content: "",
        tool_calls: [{ id: "u2", name: "edit_site_files", args: { file: "app.tsx", mode: "full", content: "ui-v2" }, type: "tool_call" }],
      }),
      new ToolMessage({ content: JSON.stringify({ ok: true, file: "app.tsx", content: "ui-v2" }), tool_call_id: "u2" }),
    ];

    const compacted = compactEditMessagesInPlace(messages);
    expect(String((compacted[1] as ToolMessage).content)).toContain("omitted");
    expect(String((compacted[3] as ToolMessage).content)).toContain("css-v1");
    expect(String((compacted[5] as ToolMessage).content)).toContain("ui-v2");
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

  test("keeps latest successful snapshot by default", () => {
    const out = redactEditHistoryPayloads([
      {
        role: "tool-call",
        toolName: "edit_code",
        toolInput: { mode: "full", code: "v1" },
        toolOutput: JSON.stringify({ ok: true, current_code: "v1" }),
      },
      {
        role: "tool-call",
        toolName: "edit_code",
        toolInput: { mode: "full", code: "v2" },
        toolOutput: JSON.stringify({ ok: true, current_code: "v2" }),
      },
    ]);
    expect(out[0].toolOutput).toContain("omitted");
    expect(out[1].toolOutput).toContain('"current_code":"v2"');
    expect(String((out[1].toolInput as { code: string }).code)).toContain("omitted");
  });

  test("keepLatestOutput: false redacts every snapshot", () => {
    const out = redactEditHistoryPayloads(
      [
        {
          role: "tool-call",
          toolName: "edit_code",
          toolInput: { mode: "full", code: "v1" },
          toolOutput: JSON.stringify({ ok: true, current_code: "v1" }),
        },
      ],
      undefined,
      { keepLatestOutput: false },
    );
    expect(out[0].toolOutput).toContain("omitted");
  });
});

describe("buildLangChainMessages", () => {
  test("orphan tool-call emits paired AIMessage + ToolMessage", () => {
    const result = buildLangChainMessages([
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

  test("coding: pairs tool results without redacting args", () => {
    const result = buildLangChainMessages([
      { role: "assistant", content: "updating" },
      {
        role: "tool-call",
        content: "",
        toolCallId: "g1",
        toolName: "edit_code",
        toolInput: { mode: "full", code: "old" },
        toolOutput: JSON.stringify({ ok: true, mode: "full" }),
      },
    ]);

    expect(result[0]).toBeInstanceOf(AIMessage);
    expect(result[1]).toBeInstanceOf(ToolMessage);
    const ai = result[0] as AIMessage;
    expect(ai.tool_calls?.[0]?.args?.code).toBe("old");
  });

  test("non-object toolInput becomes empty args", () => {
    const result = buildLangChainMessages([
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

describe("buildSiteAgentSystemPrompt", () => {
  test("does not embed draft source — agent must read_site_files", () => {
    const prompt = buildSiteAgentSystemPrompt({
      name: "Shop",
      slug: "shop",
    });
    expect(prompt).toContain('call read_site_files with file ("app.tsx" | "styles.css" | "backend.ts")');
    expect(prompt).toContain("Returns plain source text");
    expect(prompt).toContain("read_site_files → batch related edits");
    expect(prompt).not.toContain("<current_files>");
    expect(prompt).not.toContain("export default function App() { return <div>Hi</div> }");
  });
});
