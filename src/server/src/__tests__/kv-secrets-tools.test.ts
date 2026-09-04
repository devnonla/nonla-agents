import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { kvStoreTool } from "../modules/agents/runtime/llm-tools/kv-store.tool.js";
import { secretsTool } from "../modules/agents/runtime/llm-tools/secrets.tool.js";
import { createTestApp, setupAdmin } from "./test-helpers.js";

describe("KV Store + Secrets builtin tools", () => {
  let cleanup: () => void;

  beforeAll(async () => {
    const t = await createTestApp();
    cleanup = t.cleanup;
    await setupAdmin(t.app);
  });

  afterAll(() => cleanup());

  test("kv_store — set / get / list / delete", async () => {
    const setRes = JSON.parse(String(await kvStoreTool.invoke({ action: "set", key: "base_url", value: "https://api.example.com" })));
    expect(setRes.ok).toBe(true);
    expect(setRes.key).toBe("BASE_URL");
    expect(setRes.value).toBe("https://api.example.com");

    const getRes = JSON.parse(String(await kvStoreTool.invoke({ action: "get", key: "BASE_URL" })));
    expect(getRes.ok).toBe(true);
    expect(getRes.value).toBe("https://api.example.com");

    const listRes = JSON.parse(String(await kvStoreTool.invoke({ action: "list" })));
    expect(listRes.ok).toBe(true);
    expect(listRes.entries.some((e: { key: string }) => e.key === "BASE_URL")).toBe(true);

    const delRes = JSON.parse(String(await kvStoreTool.invoke({ action: "delete", key: "BASE_URL" })));
    expect(delRes.ok).toBe(true);

    const missing = JSON.parse(String(await kvStoreTool.invoke({ action: "get", key: "BASE_URL" })));
    expect(missing.ok).toBe(false);
  });

  test("kv_store — preserves Vietnamese on set get update", async () => {
    const original = "khoảng 211 nghìn các kênh ấy";
    const updated = `${original} — ${"ảầẫấậ ".repeat(80)}`;

    const setRes = JSON.parse(String(await kvStoreTool.invoke({ action: "set", key: "NOTE", value: original })));
    expect(setRes.ok).toBe(true);
    expect(setRes.value).toBe(original);

    const getRes = JSON.parse(String(await kvStoreTool.invoke({ action: "get", key: "NOTE" })));
    expect(getRes.value).toBe(original);

    const again = JSON.parse(String(await kvStoreTool.invoke({ action: "set", key: "NOTE", value: updated })));
    expect(again.value).toBe(updated);

    const got = JSON.parse(String(await kvStoreTool.invoke({ action: "get", key: "NOTE" })));
    expect(got.value).toBe(updated);

    await kvStoreTool.invoke({ action: "delete", key: "NOTE" });
  });

  test("secrets — set / get / list / delete (list hides values)", async () => {
    const setRes = JSON.parse(String(await secretsTool.invoke({ action: "set", key: "api_token", value: "tok_123" })));
    expect(setRes.ok).toBe(true);
    expect(setRes.key).toBe("API_TOKEN");
    expect(setRes).not.toHaveProperty("value");

    const getRes = JSON.parse(String(await secretsTool.invoke({ action: "get", key: "API_TOKEN" })));
    expect(getRes.ok).toBe(true);
    expect(getRes.value).toBe("tok_123");

    const listRes = JSON.parse(String(await secretsTool.invoke({ action: "list" })));
    expect(listRes.ok).toBe(true);
    expect(listRes.keys).toContain("API_TOKEN");
    expect(listRes).not.toHaveProperty("values");

    const rotate = JSON.parse(String(await secretsTool.invoke({ action: "set", key: "API_TOKEN", value: "tok_rotated" })));
    expect(rotate.ok).toBe(true);
    const afterRotate = JSON.parse(String(await secretsTool.invoke({ action: "get", key: "API_TOKEN" })));
    expect(afterRotate.value).toBe("tok_rotated");

    const delRes = JSON.parse(String(await secretsTool.invoke({ action: "delete", key: "API_TOKEN" })));
    expect(delRes.ok).toBe(true);
  });

  test("secrets — encrypt decrypt preserves Vietnamese", async () => {
    const original = "khoảng 211 nghìn các kênh ấy";
    const updated = `${original} — ${"ảầẫấậ ".repeat(80)}`;

    const setRes = JSON.parse(String(await secretsTool.invoke({ action: "set", key: "VI_SECRET", value: original })));
    expect(setRes.ok).toBe(true);

    const getRes = JSON.parse(String(await secretsTool.invoke({ action: "get", key: "VI_SECRET" })));
    expect(getRes.value).toBe(original);

    await secretsTool.invoke({ action: "set", key: "VI_SECRET", value: updated });
    const after = JSON.parse(String(await secretsTool.invoke({ action: "get", key: "VI_SECRET" })));
    expect(after.value).toBe(updated);

    await secretsTool.invoke({ action: "delete", key: "VI_SECRET" });
  });
});
