/**
 * run_js — Builtin tool: evaluate a JavaScript snippet in an isolated Bun child.
 * Code is passed via stdin (not written to disk). No TypeScript, no npm install.
 * Long runs detach via the shared background-task soft-wait (no local wall-clock kill).
 */

import { rmSync } from "node:fs";
import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { bgTaskRegistry } from "../../../modules/tools/common/bg-task-registry.js";
import { ensureWritableDir, sandboxChildEnv, wrapForSandbox } from "../../sandbox/index.js";
import { tmpDir } from "../../utils/data-dir.js";

const MAX_CODE_CHARS = 64_000;
const MAX_OUTPUT_CHARS = 32_000;
const KILL_GRACE_MS = 2_000;
/** Same window as custom tools (`CUSTOM_TOOL_SOFT_WAIT_MS`) — inlined to avoid an import cycle. */
const SOFT_WAIT_MS = 120_000;

const HARNESS = `
const inspect = (value) => {
  if (typeof value === "string") return value;
  try { return Bun.inspect(value); } catch { return String(value); }
};
const logs = [];
const tee = (...args) => { logs.push(args.map(inspect).join(" ")); };
console.log = tee;
console.info = tee;
console.debug = tee;
console.warn = tee;
console.error = tee;

const code = await new Response(Bun.stdin).text();
try {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const result = await new AsyncFunction(code)();
  const payload = { ok: true, result: result === undefined ? null : result };
  if (logs.length) payload.console = logs.join("\\n");
  try {
    process.stdout.write(JSON.stringify(payload) + "\\n");
  } catch {
    payload.result = inspect(result);
    process.stdout.write(JSON.stringify(payload) + "\\n");
  }
} catch (err) {
  const error = err instanceof Error ? err.message + "\\n" + (err.stack ?? "") : String(err);
  const payload = { ok: false, error };
  if (logs.length) payload.console = logs.join("\\n");
  process.stdout.write(JSON.stringify(payload) + "\\n");
  process.exit(1);
}
`;

export type RunJsResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
  console?: string;
};

export type RunJsSoftWaitResult = { status: "completed"; payload: RunJsResult } | { status: "running"; taskId: string; toolName: string };

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:javascript|js)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… truncated (${text.length} chars)`;
}

function clipResult(parsed: RunJsResult): RunJsResult {
  if (typeof parsed.error === "string") parsed.error = clip(parsed.error, MAX_OUTPUT_CHARS);
  if (typeof parsed.console === "string") parsed.console = clip(parsed.console, MAX_OUTPUT_CHARS);
  try {
    const resultStr = JSON.stringify(parsed.result);
    if (resultStr && resultStr.length > MAX_OUTPUT_CHARS) {
      parsed.result = clip(resultStr, MAX_OUTPUT_CHARS);
    }
  } catch {
    /* keep as-is */
  }
  return parsed;
}

function parsePayload(stdout: string, stderr: string): RunJsResult {
  const trimmed = stdout.trim();
  const consoleOut = stderr.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as RunJsResult;
      if (consoleOut) parsed.console = parsed.console ? `${parsed.console}\n${consoleOut}` : consoleOut;
      return clipResult(parsed);
    } catch {
      /* fall through */
    }
  }
  return clipResult({
    ok: false,
    error: consoleOut || trimmed || "Script exited with error",
  });
}

function validateCode(rawCode: string): { code: string } | RunJsResult {
  const code = stripFences(rawCode);
  if (!code) return { ok: false, error: "code is empty" };
  if (code.length > MAX_CODE_CHARS) {
    return { ok: false, error: `code must be ≤${MAX_CODE_CHARS} characters` };
  }
  return { code };
}

type SpawnedJs = {
  pid: number | undefined;
  kill: () => void;
  done: Promise<RunJsResult>;
  cleanup: () => void;
};

async function spawnJs(code: string): Promise<SpawnedJs> {
  const sandboxDir = ensureWritableDir(`${tmpDir()}/run-js-${crypto.randomUUID()}`);
  try {
    const argv = await wrapForSandbox([process.execPath, "-e", HARNESS], {
      cwd: sandboxDir,
      writablePaths: [sandboxDir],
    });

    const proc = Bun.spawn(argv, {
      cwd: sandboxDir,
      env: sandboxChildEnv({
        TMPDIR: sandboxDir,
        TMP: sandboxDir,
        TEMP: sandboxDir,
        BUN_INSTALL: `${sandboxDir}/.bun`,
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: `${sandboxDir}/.bun-cache`,
      }),
      stdin: new Blob([code]),
      stdout: "pipe",
      stderr: "pipe",
    });

    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = () => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      killTimer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, KILL_GRACE_MS);
    };

    const done = Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]).then(([stdout, stderr]) => parsePayload(stdout, stderr));

    return {
      pid: proc.pid,
      kill,
      done,
      cleanup: () => {
        if (killTimer) clearTimeout(killTimer);
        try {
          rmSync(sandboxDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      },
    };
  } catch (err) {
    try {
      rmSync(sandboxDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export async function runJs(rawCode: string, opts?: { abortSignal?: AbortSignal }): Promise<RunJsResult> {
  const validated = validateCode(rawCode);
  if ("ok" in validated) return validated;

  const abortSignal = opts?.abortSignal;
  if (abortSignal?.aborted) return { ok: false, error: "cancelled" };

  const spawned = await spawnJs(validated.code);
  const onAbort = () => spawned.kill();
  abortSignal?.addEventListener("abort", onAbort, { once: true });
  try {
    const result = await spawned.done;
    if (abortSignal?.aborted) return { ok: false, error: "cancelled" };
    return result;
  } finally {
    abortSignal?.removeEventListener("abort", onAbort);
    spawned.cleanup();
  }
}

export async function runJsWithSoftWait(
  rawCode: string,
  opts?: {
    abortSignal?: AbortSignal;
    agentId?: string;
    conversationId?: string | null;
    softWaitMs?: number;
  },
): Promise<RunJsSoftWaitResult> {
  const validated = validateCode(rawCode);
  if ("ok" in validated) return { status: "completed", payload: validated };

  const abortSignal = opts?.abortSignal;
  if (abortSignal?.aborted) return { status: "completed", payload: { ok: false, error: "cancelled" } };

  const spawned = await spawnJs(validated.code);
  const onAbort = () => spawned.kill();
  abortSignal?.addEventListener("abort", onAbort, { once: true });

  const softWaitMs = opts?.softWaitMs ?? SOFT_WAIT_MS;
  let softTimer: ReturnType<typeof setTimeout> | undefined;
  const softPromise = new Promise<"timeout">((resolve) => {
    softTimer = setTimeout(() => resolve("timeout"), Math.max(0, softWaitMs));
  });

  try {
    const raced = await Promise.race([spawned.done.then((r) => ({ kind: "done" as const, r })), softPromise.then(() => ({ kind: "timeout" as const }))]);
    if (softTimer) clearTimeout(softTimer);

    if (abortSignal?.aborted) {
      spawned.kill();
      await spawned.done.catch(() => undefined);
      return { status: "completed", payload: { ok: false, error: "cancelled" } };
    }

    if (raced.kind === "done") {
      spawned.cleanup();
      return { status: "completed", payload: raced.r };
    }

    abortSignal?.removeEventListener("abort", onAbort);
    const taskId = bgTaskRegistry.register({
      toolId: "builtin:run_js",
      toolName: "run_js",
      agentId: opts?.agentId,
      conversationId: opts?.conversationId,
      pid: spawned.pid,
      kill: spawned.kill,
    });
    void spawned.done.then(
      (r) => {
        bgTaskRegistry.finish(taskId, r);
        spawned.cleanup();
      },
      (err) => {
        bgTaskRegistry.finish(taskId, { ok: false, error: err instanceof Error ? err.message : String(err) });
        spawned.cleanup();
      },
    );
    return { status: "running", taskId, toolName: "run_js" };
  } catch (err) {
    spawned.kill();
    spawned.cleanup();
    throw err;
  } finally {
    if (softTimer) clearTimeout(softTimer);
    abortSignal?.removeEventListener("abort", onAbort);
  }
}

const DESCRIPTION = `Run a JavaScript snippet in an isolated Bun process (in-memory, not saved).
JavaScript only — no TypeScript, no npm packages. Use \`return\` for the value (e.g. return 1+2).
console.log is captured. Use for calculation, parsing, or transforming data.
If it takes longer than ~2 minutes it returns status "running" with a taskId — use background_tasks (await/get/cancel).`;

export type MakeRunJsToolOptions = {
  agentId?: string;
  conversationId?: string | null;
  abortSignal?: AbortSignal;
};

export function makeRunJsTool(options: MakeRunJsToolOptions = {}): StructuredToolInterface {
  return tool(
    async ({ code }) => {
      const out = await runJsWithSoftWait(code, options);
      if (out.status === "running") {
        return JSON.stringify({
          status: "running",
          taskId: out.taskId,
          toolName: out.toolName,
          message: "Still running in the background. Use background_tasks (await/get/list/cancel) with this taskId.",
        });
      }
      return JSON.stringify(out.payload);
    },
    {
      name: "run_js",
      description: DESCRIPTION,
      schema: z.object({
        code: z.string().describe("JavaScript source. Use return for the result. No TypeScript, no markdown fences."),
      }),
    },
  );
}

export const TOOL_DEF = {
  toolName: "run_js",
  toolLabel: "Run JS",
  description: "Run a JavaScript snippet in memory (isolated Bun process). Use return for the result. No TypeScript, no npm packages. Long runs detach to background_tasks.",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "JavaScript source. Use return for the result. No TypeScript, no markdown fences.",
      },
    },
    required: ["code"],
  },
};
