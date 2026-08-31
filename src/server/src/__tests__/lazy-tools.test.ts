import { describe, expect, test } from "bun:test";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { makeGetToolSchemaTool } from "../modules/agents/runtime/llm-tools/get-tool-schema.tool.js";
import { appendToolsCatalog, buildLazyToolsBundle, collectLoadedToolNamesFromMessages } from "../modules/agents/runtime/utils/lazy-tools.middleware.js";

function makeStubTool(name: string, description: string, paramKey: string) {
  return tool(async () => "ok", {
    name,
    description,
    schema: z.object({ [paramKey]: z.string() }),
  });
}

describe("lazy tool schemas", () => {
  test("get_tool_schema loads multiple tools in one call", async () => {
    const a = makeStubTool("alpha", "Alpha tool does alpha things.", "x");
    const b = makeStubTool("beta", "Beta tool does beta things.", "y");
    const loaded: string[] = [];
    const registry = new Map([
      [a.name, a],
      [b.name, b],
    ]);
    const getSchema = makeGetToolSchemaTool(registry, (names) => loaded.push(...names));

    const raw = await getSchema.invoke({ names: ["alpha", "beta", "missing"] });
    const parsed = JSON.parse(typeof raw === "string" ? raw : String(raw));

    expect(parsed.tools).toHaveLength(2);
    expect(parsed.tools.map((t: { name: string }) => t.name).sort()).toEqual(["alpha", "beta"]);
    expect(parsed.tools[0].parameters).toBeTruthy();
    expect(parsed.missing).toEqual(["missing"]);
    expect(loaded.sort()).toEqual(["alpha", "beta"]);
  });

  test("loadedToolNames grows after get_tool_schema", async () => {
    const browser = makeStubTool("browser", "Browser automation tool.", "action");
    const datatable = makeStubTool("datatable", "Datatable tool.", "query");
    const lazy = buildLazyToolsBundle([browser, datatable]);

    expect(lazy.loadedToolNames()).toEqual([]);

    await lazy.getToolSchema.invoke({ names: ["browser", "datatable"] });
    expect(lazy.loadedToolNames().sort()).toEqual(["browser", "datatable"]);
  });

  test("catalog lists short descriptions without full schemas", () => {
    const t = makeStubTool("kv_store", "Read and write the shared workspace key-value store. Prefer Secrets for credentials.", "key");
    const lazy = buildLazyToolsBundle([t]);
    expect(lazy.catalogPromptSection).toContain("`kv_store`");
    expect(lazy.catalogPromptSection).toContain("get_tool_schema");
    expect(lazy.catalogPromptSection).toContain("Batch every tool");
    expect(lazy.catalogPromptSection).not.toContain("Prefer Secrets for credentials");
    expect(appendToolsCatalog("You are helpful.", lazy.catalogPromptSection)).toContain("<available_tools>");
  });

  test("collectLoadedToolNamesFromMessages recovers schema loads and prior tool calls", () => {
    const names = collectLoadedToolNamesFromMessages([
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "get_tool_schema", args: { names: ["browser", "datatable"] } }],
      },
      { role: "tool-result", toolCallId: "tc1", toolName: "get_tool_schema", result: "{}" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc2", name: "browser", args: { action: "snapshot" } }],
      },
      { role: "tool-result", toolCallId: "tc2", toolName: "browser", result: "ok" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "tc3", name: "kv_store", args: { action: "list" } }],
      },
    ]);
    expect(names.sort()).toEqual(["browser", "datatable", "kv_store"]);
  });

  test("buildLazyToolsBundle hydrates loaded tools from prior messages", () => {
    const browser = makeStubTool("browser", "Browser tool.", "action");
    const datatable = makeStubTool("datatable", "Datatable tool.", "query");
    const kv = makeStubTool("kv_store", "KV tool.", "key");

    const history = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "get_tool_schema", args: { names: ["browser"] } }],
      },
      { role: "tool-result", toolCallId: "tc1", toolName: "get_tool_schema", result: "{}" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc2", name: "datatable", args: { query: "x" } }],
      },
      { role: "tool-result", toolCallId: "tc2", toolName: "datatable", result: "[]" },
    ];

    const lazy = buildLazyToolsBundle([browser, datatable, kv], { messages: history });
    expect(lazy.loadedToolNames().sort()).toEqual(["browser", "datatable"]);

    const cold = buildLazyToolsBundle([browser, datatable, kv]);
    expect(cold.loadedToolNames()).toEqual([]);
  });
});
