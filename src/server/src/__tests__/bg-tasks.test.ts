import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { isSandboxAvailable } from "../common/sandbox/index.js";
import { tmpDir } from "../common/utils/data-dir.js";
import { bgTaskRegistry } from "../modules/tools/common/bg-task-registry.js";
import { _stopProxyHubForTests } from "../modules/tools/common/nonlaagents-proxy.js";
import { executeTool, executeToolWithSoftWait } from "../modules/tools/common/tool-runner.js";

describe("background tool soft-wait", () => {
  let dataDir: string;

  afterEach(() => {
    bgTaskRegistry._reset();
    _stopProxyHubForTests();
    if (dataDir) {
      try {
        rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  test("completes within soft-wait returns result", async () => {
    dataDir = `${tmpDir()}/nonla-agents-bg-${crypto.randomUUID()}`;
    const code = `export default async function main(input: Record<string, unknown>) {
  return { echo: input.x };
}`;
    const out = await executeToolWithSoftWait({
      toolId: "tool-fast",
      toolName: "fast_echo",
      code,
      inputJson: JSON.stringify({ x: 1 }),
      dataDir,
      softWaitMs: 30_000,
    });
    expect(out.status).toBe("completed");
    if (out.status !== "completed") return;
    const parsed = JSON.parse(out.payload) as { ok: boolean; result: { echo: number } };
    expect(parsed.ok).toBe(true);
    expect(parsed.result.echo).toBe(1);
  }, 60_000);

  test("preserves Vietnamese in input and large UTF-8 stdout", async () => {
    dataDir = `${tmpDir()}/nonla-agents-bg-${crypto.randomUUID()}`;
    const vi = "khoảng 211 nghìn các kênh ấy lạ hơn ngoại nửa phân bổ";
    const code = `export default async function main(input: Record<string, unknown>) {
  const text = String(input.text ?? "");
  return { echo: text, long: ("ảầẫ ".repeat(20000)) + text };
}`;
    const out = await executeToolWithSoftWait({
      toolId: "tool-utf8",
      toolName: "utf8_echo",
      code,
      inputJson: JSON.stringify({ text: vi }),
      dataDir,
      softWaitMs: 30_000,
    });
    expect(out.status).toBe("completed");
    if (out.status !== "completed") return;
    const parsed = JSON.parse(out.payload) as { ok: boolean; result: { echo: string; long: string } };
    expect(parsed.ok).toBe(true);
    expect(parsed.result.echo).toBe(vi);
    expect(parsed.result.long.startsWith("ảầẫ ")).toBe(true);
    expect(parsed.result.long.endsWith(vi)).toBe(true);
    expect(parsed.result.long.includes("�")).toBe(false);
  }, 60_000);

  test("exceeds soft-wait detaches then await completes", async () => {
    dataDir = `${tmpDir()}/nonla-agents-bg-${crypto.randomUUID()}`;
    const code = `export default async function main() {
  await Bun.sleep(1500);
  return { done: true };
}`;
    const out = await executeToolWithSoftWait({
      toolId: "tool-slow",
      toolName: "slow_sleep",
      code,
      inputJson: "{}",
      dataDir,
      softWaitMs: 200,
      agentId: "agent-1",
    });
    expect(out.status).toBe("running");
    if (out.status !== "running") return;

    const listed = bgTaskRegistry.list({ agentId: "agent-1" });
    expect(listed.some((t) => t.taskId === out.taskId)).toBe(true);

    const finished = await bgTaskRegistry.await(out.taskId, 15_000);
    expect(finished.status).toBe("completed");
    expect(finished.result).toEqual({ done: true });
  }, 60_000);

  test("cancel kills a running detached task", async () => {
    dataDir = `${tmpDir()}/nonla-agents-bg-${crypto.randomUUID()}`;
    const code = `export default async function main() {
  await Bun.sleep(30_000);
  return { done: true };
}`;
    const out = await executeToolWithSoftWait({
      toolId: "tool-cancel",
      toolName: "slow_cancel",
      code,
      inputJson: "{}",
      dataDir,
      softWaitMs: 150,
    });
    expect(out.status).toBe("running");
    if (out.status !== "running") return;

    const cancelled = bgTaskRegistry.cancel(out.taskId);
    expect(cancelled?.status).toBe("cancelled");

    const snap = await bgTaskRegistry.await(out.taskId, 5_000);
    expect(snap.status).toBe("cancelled");
  }, 60_000);

  test("detached task streams console.log into console", async () => {
    dataDir = `${tmpDir()}/nonla-agents-bg-${crypto.randomUUID()}`;
    const code = `export default async function main() {
  console.log("line-one");
  await Bun.sleep(1200);
  console.log("line-two");
  return { done: true };
}`;
    const out = await executeToolWithSoftWait({
      toolId: "tool-logs",
      toolName: "log_sleep",
      code,
      inputJson: "{}",
      dataDir,
      softWaitMs: 200,
      conversationId: "conv-logs",
    });
    expect(out.status).toBe("running");
    if (out.status !== "running") return;

    await new Promise((r) => setTimeout(r, 400));
    const mid = bgTaskRegistry.get(out.taskId);
    expect(mid?.console ?? "").toContain("line-one");

    const finished = await bgTaskRegistry.await(out.taskId, 15_000);
    expect(finished.status).toBe("completed");
    expect(finished.console ?? "").toContain("line-one");
    expect(finished.console ?? "").toContain("line-two");
  }, 60_000);

  test("does not leak host env canary into the child", async () => {
    dataDir = `${tmpDir()}/nonla-agents-bg-${crypto.randomUUID()}`;
    const canary = `NONLA_TEST_CANARY_${crypto.randomUUID()}`;
    process.env[canary] = "secret";
    try {
      const raw = await executeTool(
        "tool-env",
        `export default async function main() {
  return { keys: Object.keys(process.env) };
}`,
        "{}",
        dataDir,
        30_000,
      );
      const parsed = JSON.parse(raw) as { ok: boolean; result: { keys: string[] } };
      expect(parsed.ok).toBe(true);
      expect(parsed.result.keys).not.toContain(canary);
      expect(parsed.result.keys).toContain("PATH");
      expect(parsed.result.keys).toContain("INPUT_JSON_FILE");
      expect(parsed.result.keys).toContain("NONLAAGENTS_TOKEN");
    } finally {
      delete process.env[canary];
    }
  }, 60_000);

  test("times out a sleeping tool", async () => {
    dataDir = `${tmpDir()}/nonla-agents-bg-${crypto.randomUUID()}`;
    const raw = await executeTool(
      "tool-timeout",
      `export default async function main() {
  await Bun.sleep(30_000);
  return { done: true };
}`,
      "{}",
      dataDir,
      400,
    );
    const parsed = JSON.parse(raw) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error ?? "").toContain("timed out");
  }, 60_000);

  test("reuses hashed user module and stable run.ts across runs", async () => {
    dataDir = `${tmpDir()}/nonla-agents-bg-${crypto.randomUUID()}`;
    const code = `export default async function main(input: Record<string, unknown>) {
  return { n: input.n };
}`;
    const first = JSON.parse(await executeTool("tool-cache", code, JSON.stringify({ n: 1 }), dataDir, 30_000)) as {
      ok: boolean;
      result: { n: number };
    };
    expect(first.ok).toBe(true);
    expect(first.result.n).toBe(1);

    const envDir = `${dataDir}/tool_envs/tool-cache`;
    expect(existsSync(`${envDir}/run.ts`)).toBe(true);
    const userFiles = readdirSync(envDir).filter((f) => f.startsWith("user_") && f.endsWith(".ts"));
    expect(userFiles.length).toBe(1);

    const second = JSON.parse(await executeTool("tool-cache", code, JSON.stringify({ n: 2 }), dataDir, 30_000)) as {
      ok: boolean;
      result: { n: number };
    };
    expect(second.ok).toBe(true);
    expect(second.result.n).toBe(2);
    expect(readdirSync(envDir).filter((f) => f.startsWith("user_") && f.endsWith(".ts")).length).toBe(1);
    expect(readdirSync(envDir).filter((f) => f.startsWith("input_")).length).toBe(0);
  }, 60_000);

  test("installs and imports an external package inside the sandbox", async () => {
    dataDir = `${tmpDir()}/nonla-agents-bg-${crypto.randomUUID()}`;
    const raw = await executeTool(
      "tool-external-pkg",
      `import { nanoid } from "nanoid";
export default async function main() {
  return { id: nanoid(6), fn: typeof nanoid };
}`,
      "{}",
      dataDir,
      60_000,
    );
    const parsed = JSON.parse(raw) as { ok: boolean; result?: { id: string; fn: string }; error?: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.result?.fn).toBe("function");
    expect(parsed.result?.id?.length).toBe(6);
    expect(existsSync(`${dataDir}/tool_envs/tool-external-pkg/node_modules/nanoid/package.json`)).toBe(true);
  }, 90_000);

  test("removes the stale user module when tool code changes", async () => {
    dataDir = `${tmpDir()}/nonla-agents-bg-${crypto.randomUUID()}`;
    const envDir = `${dataDir}/tool_envs/tool-revision`;

    const first = await executeTool("tool-revision", "export default async function main() { return { rev: 1 }; }", "{}", dataDir, 30_000);
    expect((JSON.parse(first) as { result: { rev: number } }).result.rev).toBe(1);
    const afterFirst = readdirSync(envDir).filter((f) => f.startsWith("user_") && f.endsWith(".ts"));
    expect(afterFirst.length).toBe(1);

    const second = await executeTool("tool-revision", "export default async function main() { return { rev: 2 }; }", "{}", dataDir, 30_000);
    expect((JSON.parse(second) as { result: { rev: number } }).result.rev).toBe(2);
    const afterSecond = readdirSync(envDir).filter((f) => f.startsWith("user_") && f.endsWith(".ts"));
    expect(afterSecond.length).toBe(1);
    expect(afterSecond[0]).not.toBe(afterFirst[0]);
  }, 60_000);

  test("keeps an in-flight user module when a newer revision starts on the same tool", async () => {
    dataDir = `${tmpDir()}/nonla-agents-bg-${crypto.randomUUID()}`;
    const slow = executeToolWithSoftWait({
      toolId: "tool-shared-rev",
      toolName: "shared_rev",
      code: `export default async function main() {
  await Bun.sleep(1500);
  return { rev: 1 };
}`,
      inputJson: "{}",
      dataDir,
      softWaitMs: 150,
    });
    const fast = JSON.parse(await executeTool("tool-shared-rev", "export default async function main() { return { rev: 2 }; }", "{}", dataDir, 30_000)) as {
      ok: boolean;
      result: { rev: number };
    };
    expect(fast.ok).toBe(true);
    expect(fast.result.rev).toBe(2);

    const detached = await slow;
    expect(detached.status).toBe("running");
    if (detached.status !== "running") return;
    const finished = await bgTaskRegistry.await(detached.taskId, 15_000);
    expect(finished.status).toBe("completed");
    expect(finished.result).toEqual({ rev: 1 });
  }, 60_000);

  test("releases the concurrency slot after a detached task is cancelled", async () => {
    const prev = process.env.TOOL_RUNNER_MAX_CONCURRENT;
    process.env.TOOL_RUNNER_MAX_CONCURRENT = "1";
    dataDir = `${tmpDir()}/nonla-agents-bg-${crypto.randomUUID()}`;
    try {
      const out = await executeToolWithSoftWait({
        toolId: "tool-slot",
        toolName: "slot_hold",
        code: `export default async function main() {
  await Bun.sleep(30_000);
  return { done: true };
}`,
        inputJson: "{}",
        dataDir,
        softWaitMs: 150,
      });
      expect(out.status).toBe("running");
      if (out.status !== "running") return;

      bgTaskRegistry.cancel(out.taskId);
      await bgTaskRegistry.await(out.taskId, 5_000);

      const raw = await executeTool("tool-slot-next", "export default async function main() { return { ok: true }; }", "{}", dataDir, 15_000);
      const parsed = JSON.parse(raw) as { ok: boolean };
      expect(parsed.ok).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.TOOL_RUNNER_MAX_CONCURRENT;
      else process.env.TOOL_RUNNER_MAX_CONCURRENT = prev;
    }
  }, 60_000);

  test("sandbox denies writes outside the tool env when available", async () => {
    dataDir = `${tmpDir()}/nonla-agents-bg-${crypto.randomUUID()}`;
    const outside = `${dataDir}/pwned.txt`;
    const raw = await executeTool(
      "tool-sandbox-write",
      `export default async function main() {
  try {
    await Bun.write(${JSON.stringify(outside)}, "pwned");
    return { wrote: true };
  } catch (err) {
    return { wrote: false, error: String(err) };
  }
}`,
      "{}",
      dataDir,
      30_000,
    );
    const parsed = JSON.parse(raw) as { ok: boolean; result: { wrote: boolean } };
    expect(parsed.ok).toBe(true);
    if (await isSandboxAvailable()) {
      expect(parsed.result.wrote).toBe(false);
      expect(existsSync(outside)).toBe(false);
    }
  }, 60_000);
});
