import { afterEach, describe, expect, test } from "bun:test";
import { runJs, runJsWithSoftWait } from "../common/ai/agent-tools/run-js.tool.js";
import { bgTaskRegistry } from "../modules/tools/common/bg-task-registry.js";

describe("runJs", () => {
  afterEach(() => {
    bgTaskRegistry._reset();
  });

  test("returns an expression via return", async () => {
    const out = await runJs("return 1 + 2");
    expect(out.ok).toBe(true);
    expect(out.result).toBe(3);
  }, 30_000);

  test("returns objects and captures console.log", async () => {
    const out = await runJs(`
      const items = [1, 2, 3].map((n) => n * 2);
      console.log("count", items.length);
      return { items };
    `);
    expect(out.ok).toBe(true);
    expect(out.result).toEqual({ items: [2, 4, 6] });
    expect(out.console).toContain("count 3");
  }, 30_000);

  test("strips markdown fences", async () => {
    const out = await runJs("```js\nreturn 'ok'\n```");
    expect(out.ok).toBe(true);
    expect(out.result).toBe("ok");
  }, 30_000);

  test("rejects empty code", async () => {
    const out = await runJs("   ");
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/empty/i);
  });

  test("reports syntax errors", async () => {
    const out = await runJs("return {");
    expect(out.ok).toBe(false);
    expect(out.error).toBeTruthy();
  }, 30_000);

  test("abortSignal cancels a hanging snippet", async () => {
    const controller = new AbortController();
    const pending = runJs("await Bun.sleep(20_000); return 1", { abortSignal: controller.signal });
    setTimeout(() => controller.abort(), 200);
    const out = await pending;
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/cancelled/i);
  }, 15_000);

  test("exceeds soft-wait detaches then await completes", async () => {
    const out = await runJsWithSoftWait("await Bun.sleep(1500); return { done: true }", {
      softWaitMs: 200,
      agentId: "agent-run-js",
    });
    expect(out.status).toBe("running");
    if (out.status !== "running") return;

    const listed = bgTaskRegistry.list({ agentId: "agent-run-js" });
    expect(listed.some((t) => t.taskId === out.taskId)).toBe(true);

    const finished = await bgTaskRegistry.await(out.taskId, 15_000);
    expect(finished.status).toBe("completed");
    expect(finished.result).toEqual({ done: true });
  }, 30_000);
});
