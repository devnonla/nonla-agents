import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { SANDBOX_TSCONFIG, ensureWritableDir, rewriteSandboxTs, sandboxChildEnv, wrapForSandbox } from "../../../common/sandbox/index.js";
import { bgTaskRegistry } from "./bg-task-registry.js";
import { startNonlaagentsProxy } from "./nonlaagents-proxy.js";
import { writeToolsNonlaagentsPackage } from "./nonlaagents-ts.js";

/** Soft-wait before detaching a custom tool into bgTaskRegistry (Cursor-style). */
export const CUSTOM_TOOL_SOFT_WAIT_MS = 120_000;

/** Default wall-clock timeout for `executeTool` when the caller omits `timeoutMs`. */
export const DEFAULT_TOOL_TIMEOUT_MS = 120_000;

/** Hard cap from spawn (covers detached soft-wait tools). */
export const CUSTOM_TOOL_HARD_TIMEOUT_MS = 10 * 60_000;

/** Jobs cap at 3 because cron scripts are long-lived; tools are short so 16 is the default. */
const DEFAULT_MAX_CONCURRENT = 16;
const KILL_GRACE_MS = 2_000;
const PENDING_LOG_MAX_CHARS = 256 * 1024;

const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

const installedCache = new Map<string, Set<string>>();
const installLocks = new Map<string, Promise<unknown>>();
/** In-flight `user_*.ts` paths — sweep must not delete a revision another run is still executing. */
const liveUserFiles = new Map<string, number>();

let activeRuns = 0;
const runQueue: Array<() => void> = [];

function userFileKey(sandboxDir: string, userFile: string): string {
  return `${sandboxDir}/${userFile}`;
}

function retainUserFile(sandboxDir: string, userFile: string): void {
  const key = userFileKey(sandboxDir, userFile);
  liveUserFiles.set(key, (liveUserFiles.get(key) ?? 0) + 1);
}

function releaseUserFile(sandboxDir: string, userFile: string): void {
  const key = userFileKey(sandboxDir, userFile);
  const next = (liveUserFiles.get(key) ?? 0) - 1;
  if (next <= 0) liveUserFiles.delete(key);
  else liveUserFiles.set(key, next);
}

function isLiveUserFile(sandboxDir: string, name: string): boolean {
  return (liveUserFiles.get(userFileKey(sandboxDir, name)) ?? 0) > 0;
}

function maxConcurrent(): number {
  const n = Number(process.env.TOOL_RUNNER_MAX_CONCURRENT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_CONCURRENT;
}

function defaultTimeoutMs(): number {
  const n = Number(process.env.TOOL_RUNNER_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_TOOL_TIMEOUT_MS;
}

function hardTimeoutMs(): number {
  const n = Number(process.env.TOOL_RUNNER_HARD_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : CUSTOM_TOOL_HARD_TIMEOUT_MS;
}

function resolveTimeoutMs(timeoutMs?: number): number {
  if (timeoutMs === undefined || timeoutMs <= 0) return defaultTimeoutMs();
  return timeoutMs;
}

function acquireSlot(): Promise<void> {
  if (activeRuns < maxConcurrent()) {
    activeRuns += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    runQueue.push(() => {
      activeRuns += 1;
      resolve();
    });
  });
}

function releaseSlot() {
  activeRuns = Math.max(0, activeRuns - 1);
  const next = runQueue.shift();
  if (next) next();
}

async function withInstallLock<T>(toolId: string, fn: () => Promise<T>): Promise<T> {
  const prev = installLocks.get(toolId) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  installLocks.set(
    toolId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function hashShort(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex").slice(0, 16);
}

const HARNESS_TS = `const userModule = process.env.USER_MODULE;
if (!userModule) {
  process.stdout.write(JSON.stringify({ ok: false, error: "USER_MODULE is not set" }) + "\\n");
  process.exit(1);
}

const inspect = (value: unknown) => {
  if (typeof value === "string") return value;
  try {
    return Bun.inspect(value);
  } catch {
    return String(value);
  }
};

const tee =
  (write: (s: string) => void) =>
  (...args: unknown[]) => {
    write(args.map(inspect).join(" ") + "\\n");
  };

console.log = tee((s) => process.stderr.write(s));
console.info = tee((s) => process.stderr.write(s));
console.debug = tee((s) => process.stderr.write(s));
console.warn = tee((s) => process.stderr.write(s));
console.error = tee((s) => process.stderr.write(s));

const inputPath = process.env.INPUT_JSON_FILE;
if (!inputPath) {
  process.stdout.write(JSON.stringify({ ok: false, error: "INPUT_JSON_FILE is not set" }) + "\\n");
  process.exit(1);
}

try {
  const input = JSON.parse(await Bun.file(inputPath).text());
  const mod = await import(userModule);
  const fn = mod.default;
  if (typeof fn !== "function") {
    throw new Error("Tool must export default async function main(input)");
  }
  const result = await fn(input);
  process.stdout.write(JSON.stringify({ ok: true, result }) + "\\n");
} catch (err) {
  const error = err instanceof Error ? err.message + "\\n" + (err.stack ?? "") : String(err);
  process.stdout.write(JSON.stringify({ ok: false, error }) + "\\n");
  process.exit(1);
}
`;

async function writeIfChanged(path: string, content: string): Promise<void> {
  try {
    if ((await Bun.file(path).text()) === content) return;
  } catch {
    /* missing */
  }
  await Bun.write(path, content);
}

function sandboxRuntimeEnv(sandboxDir: string, extra: Record<string, string>): Record<string, string> {
  const tmp = `${sandboxDir}/tmp`;
  mkdirSync(tmp, { recursive: true });
  mkdirSync(`${sandboxDir}/.bun-cache`, { recursive: true });
  mkdirSync(`${sandboxDir}/.bun`, { recursive: true });
  return sandboxChildEnv({
    TMPDIR: tmp,
    TMP: tmp,
    TEMP: tmp,
    BUN_INSTALL: `${sandboxDir}/.bun`,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: `${sandboxDir}/.bun-cache`,
    ...extra,
  });
}

async function runCmd(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}, timeoutMs = 600_000): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const argv = await wrapForSandbox([cmd, ...args], { cwd, writablePaths: [cwd] });
  const proc = Bun.spawn(argv, {
    cwd,
    env: sandboxRuntimeEnv(cwd, env),
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  let timedOut = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const timer = setTimeout(() => {
    timedOut = true;
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
  }, timeoutMs);
  return Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]).then(([stdout, stderr, code]) => {
    clearTimeout(timer);
    if (killTimer) clearTimeout(killTimer);
    if (timedOut) {
      return { success: false, stdout: "", stderr: `Process timed out after ${timeoutMs / 1000}s` };
    }
    return { success: code === 0, stdout, stderr };
  });
}

type SpawnHandle = {
  pid: number | undefined;
  done: Promise<{ success: boolean; stdout: string; stderr: string }>;
  kill: () => void;
};

async function writeToolInputJson(sandboxDir: string, inputJson: string): Promise<string> {
  const inputPath = `${sandboxDir}/input_${crypto.randomUUID()}.json`;
  await Bun.write(inputPath, inputJson);
  return inputPath;
}

async function unlinkQuiet(path: string): Promise<void> {
  await Bun.file(path)
    .delete()
    .catch(() => undefined);
}

const ORPHAN_INPUT_MAX_AGE_MS = 30 * 60_000;

/**
 * Sweep files that would otherwise accumulate forever in a tool's sandbox dir:
 * stale `user_*.ts` from previous code revisions (hash-named, never overwritten)
 * and `input_*.json` left behind by a run that never reached its `finally`
 * cleanup (e.g. a server crash/restart mid-run).
 */
async function sweepSandboxDir(sandboxDir: string, currentUserFile: string): Promise<void> {
  let entries: string[];
  try {
    entries = readdirSync(sandboxDir);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of entries) {
    if (name.startsWith("user_") && name.endsWith(".ts") && name !== currentUserFile && !isLiveUserFile(sandboxDir, name)) {
      await unlinkQuiet(`${sandboxDir}/${name}`);
      continue;
    }
    if (name.startsWith("input_") && name.endsWith(".json")) {
      const path = `${sandboxDir}/${name}`;
      try {
        if (now - statSync(path).mtimeMs > ORPHAN_INPUT_MAX_AGE_MS) await unlinkQuiet(path);
      } catch {
        /* ignore */
      }
    }
  }
}

async function readUtf8Stream(stream: ReadableStream<Uint8Array>, onChunk?: (piece: string) => void, maxChars = 5 * 1024 * 1024): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder("utf-8");
  let acc = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const piece = dec.decode(value, { stream: true });
    if (onChunk && piece) onChunk(piece);
    acc += piece;
    if (acc.length > maxChars) acc = acc.slice(-maxChars);
  }
  acc += dec.decode();
  return acc.length > maxChars ? acc.slice(-maxChars) : acc;
}

async function spawnCmd(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}, onStderr?: (chunk: string) => void): Promise<SpawnHandle> {
  const writable = ensureWritableDir(cwd);
  const argv = await wrapForSandbox([cmd, ...args], { cwd: writable, writablePaths: [writable] });
  const proc = Bun.spawn(argv, {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  let killed = false;
  let exited = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;

  const finishKill = () => {
    if (killTimer) {
      clearTimeout(killTimer);
      killTimer = undefined;
    }
  };

  const killProc = (signal?: "SIGKILL") => {
    try {
      if (signal) proc.kill(signal);
      else proc.kill();
    } catch {
      /* ignore */
    }
  };

  const done = Promise.all([readUtf8Stream(proc.stdout), readUtf8Stream(proc.stderr, onStderr), proc.exited])
    .then(([stdout, stderr, code]) => {
      exited = true;
      finishKill();
      return {
        success: !killed && code === 0,
        stdout,
        stderr: killed ? stderr || "Process cancelled" : stderr,
      };
    })
    .catch((err) => {
      killProc();
      killProc("SIGKILL");
      exited = true;
      finishKill();
      return {
        success: false,
        stdout: "",
        stderr: killed ? "Process cancelled" : err instanceof Error ? err.message : String(err),
      };
    });

  return {
    pid: proc.pid,
    done,
    kill: () => {
      if (exited || killed) return;
      killed = true;
      killProc();
      killTimer = setTimeout(() => killProc("SIGKILL"), KILL_GRACE_MS);
    },
  };
}

function packageNameFromSpecifier(spec: string): string | null {
  const trimmed = spec.trim();
  if (!trimmed || trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.startsWith("node:") || trimmed.startsWith("bun:")) return null;
  if (trimmed === "nonlaagents" || trimmed === "@nonla-agents/runtime") return null;
  if (trimmed.startsWith("@")) {
    const [scope, name] = trimmed.split("/");
    if (!scope || !name) return null;
    return `${scope}/${name}`;
  }
  const base = trimmed.split("/")[0] ?? "";
  if (!base || NODE_BUILTINS.has(base)) return null;
  return base;
}

function detectPackages(code: string): string[] {
  const pkgs = new Set<string>();
  const bunOverrides = new Set<string>();

  for (const line of code.split("\n")) {
    const t = line.trim();

    const standalone = t.match(/^\/\/\s*bun:\s*(.+)/i);
    if (standalone) {
      for (const p of standalone[1].split(/[\s,]+/).filter(Boolean)) bunOverrides.add(p);
      continue;
    }

    const inline = t.match(/\/\/\s*bun:\s*(.+)/i);
    if (inline) {
      for (const p of inline[1].split(/[\s,]+/).filter(Boolean)) bunOverrides.add(p);
    }

    const codePart = t.replace(/\/\/.*$/, "").trim();
    for (const match of codePart.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
      const name = packageNameFromSpecifier(match[1] ?? "");
      if (name) pkgs.add(name);
    }
  }

  if (bunOverrides.size > 0) {
    for (const p of pkgs) bunOverrides.add(p);
    return [...bunOverrides];
  }
  return [...pkgs];
}

function isPkgInstalled(sandboxDir: string, pkg: string): boolean {
  return existsSync(`${sandboxDir}/node_modules/${pkg}/package.json`);
}

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:typescript|ts|javascript|js)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function isHoistableImport(line: string): boolean {
  const t = line.trim();
  return t.startsWith("import ") || t.startsWith("import\t") || /^import\s*['"]/.test(t) || t.startsWith("export type ") || t.startsWith("export interface ") || t.startsWith("export {");
}

/** Ensure the module exports default async function main(input). */
function ensureDefaultExport(raw: string): string {
  const code = stripFences(raw);
  if (/export\s+default\b/.test(code)) return code;

  if (/\basync\s+function\s+main\s*\(/.test(code)) {
    return code.replace(/\basync\s+function\s+main\s*\(/, "export default async function main(");
  }
  if (/\bfunction\s+main\s*\(/.test(code)) {
    return code.replace(/\bfunction\s+main\s*\(/, "export default async function main(");
  }

  const lines = code.split("\n");
  const imports: string[] = [];
  const body: string[] = [];
  for (const line of lines) {
    if (isHoistableImport(line)) imports.push(line);
    else body.push(line);
  }
  const indented = body.map((l) => (l.trim() === "" ? "" : `  ${l}`)).join("\n");
  const bodyBlock = indented.trim() ? indented : "  return null;";
  const importBlock = imports.length ? `${imports.join("\n")}\n\n` : "";
  return `${importBlock}export default async function main(input: Record<string, unknown>) {\n${bodyBlock}\n}\n`;
}

type PreparedRun = {
  sandboxDir: string;
  runPath: string;
  userFile: string;
  proxy: ReturnType<typeof startNonlaagentsProxy>;
};

async function ensurePackages(toolId: string, sandboxDir: string, pkgs: string[]): Promise<{ errorJson: string } | null> {
  if (pkgs.length === 0) return null;

  return withInstallLock(toolId, async () => {
    const cached = installedCache.get(toolId);
    const missing = cached ? pkgs.filter((p) => !cached.has(p)) : pkgs.filter((p) => !isPkgInstalled(sandboxDir, p));
    if (missing.length > 0) {
      const installResult = await runCmd(process.execPath, ["add", ...missing], sandboxDir, {}, 120_000);
      if (!installResult.success) {
        return {
          errorJson: JSON.stringify({
            ok: false,
            error: `Package install failed [${missing.join(", ")}]:\n${installResult.stderr || installResult.stdout}`,
          }),
        };
      }
    }
    const updated = cached ?? new Set<string>();
    for (const p of pkgs) updated.add(p);
    installedCache.set(toolId, updated);
    return null;
  });
}

async function prepareToolRun(toolId: string, code: string, dataDir: string): Promise<PreparedRun | { errorJson: string }> {
  const sandboxDir = ensureWritableDir(`${dataDir}/tool_envs/${toolId}`);

  const pkgPath = `${sandboxDir}/package.json`;
  if (!existsSync(pkgPath)) {
    await Bun.write(pkgPath, JSON.stringify({ name: `tool-${toolId}`, type: "module", private: true }));
  }

  const pkgs = detectPackages(code);
  const installError = await ensurePackages(toolId, sandboxDir, pkgs);
  if (installError) return installError;

  await writeToolsNonlaagentsPackage(sandboxDir);

  const userCode = rewriteSandboxTs(ensureDefaultExport(code));
  const userFile = `user_${hashShort(userCode)}.ts`;
  const userPath = `${sandboxDir}/${userFile}`;
  const runPath = `${sandboxDir}/run.ts`;
  const tsconfigPath = `${sandboxDir}/tsconfig.json`;
  // Retain before the file becomes visible on disk (no await in between) so a
  // concurrent run's sweep on this same sandboxDir can never observe the file
  // without also observing it as live.
  retainUserFile(sandboxDir, userFile);
  try {
    if (!existsSync(userPath)) {
      await Bun.write(userPath, userCode);
    }
    await writeIfChanged(runPath, HARNESS_TS);
    await writeIfChanged(tsconfigPath, SANDBOX_TSCONFIG);
    await sweepSandboxDir(sandboxDir, userFile);
    const proxy = startNonlaagentsProxy();
    return { sandboxDir, runPath, userFile, proxy };
  } catch (err) {
    releaseUserFile(sandboxDir, userFile);
    throw err;
  }
}

async function cleanupPrepared(prep: PreparedRun, inputPath?: string): Promise<void> {
  releaseUserFile(prep.sandboxDir, prep.userFile);
  prep.proxy.stop();
  if (inputPath) await unlinkQuiet(inputPath);
}

function formatRunResult(result: { success: boolean; stdout: string; stderr: string }): string {
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();

  const attachConsole = (v: Record<string, unknown>) => {
    if (stderr) v.console = stderr;
    return v;
  };

  if (!result.success) {
    if (stdout?.startsWith("{")) {
      try {
        return JSON.stringify(attachConsole(JSON.parse(stdout)));
      } catch {
        /* noop */
      }
    }
    return JSON.stringify({
      ok: false,
      error: stderr || stdout || "Script exited with error",
    });
  }

  if (!stdout) {
    return JSON.stringify(attachConsole({ ok: true, result: null, console: stderr || null }));
  }

  try {
    return JSON.stringify(attachConsole(JSON.parse(stdout)));
  } catch {
    return JSON.stringify(attachConsole({ ok: true, result: stdout }));
  }
}

function parseOutcomeFromResultJson(resultStr: string): { ok: boolean; result?: unknown; error?: string; console?: string } {
  try {
    const parsed = JSON.parse(resultStr) as { ok?: boolean; result?: unknown; error?: string; console?: string };
    return {
      ok: parsed.ok === true,
      result: parsed.result,
      error: parsed.error,
      console: typeof parsed.console === "string" ? parsed.console : undefined,
    };
  } catch {
    return { ok: false, error: resultStr };
  }
}

function toolRunEnv(prepared: PreparedRun, inputPath: string): Record<string, string> {
  return sandboxRuntimeEnv(prepared.sandboxDir, {
    INPUT_JSON_FILE: inputPath,
    USER_MODULE: `./${prepared.userFile}`,
    NONLAAGENTS_URL: prepared.proxy.url,
    NONLAAGENTS_TOKEN: prepared.proxy.token,
  });
}

export async function executeTool(toolId: string, code: string, inputJson: string, dataDir: string, timeoutMs?: number): Promise<string> {
  await acquireSlot();
  const wallMs = resolveTimeoutMs(timeoutMs);
  let prepared: PreparedRun | undefined;
  let inputPath: string | undefined;
  let handle: SpawnHandle | undefined;
  try {
    const prep = await prepareToolRun(toolId, code, dataDir);
    if ("errorJson" in prep) return prep.errorJson;
    prepared = prep;

    inputPath = await writeToolInputJson(prepared.sandboxDir, inputJson);
    handle = await spawnCmd(process.execPath, [prepared.runPath], prepared.sandboxDir, toolRunEnv(prepared, inputPath));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      handle?.kill();
    }, wallMs);
    try {
      const result = await handle.done;
      if (timedOut) {
        return JSON.stringify({ ok: false, error: `Tool timed out after ${wallMs}ms` });
      }
      return formatRunResult(result);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    handle?.kill();
    throw err;
  } finally {
    if (prepared) await cleanupPrepared(prepared, inputPath);
    releaseSlot();
  }
}

export type SoftWaitExecuteResult = { status: "completed"; payload: string } | { status: "running"; taskId: string; toolName: string };

export type ExecuteToolSoftWaitOptions = {
  toolId: string;
  toolName: string;
  code: string;
  inputJson: string;
  dataDir: string;
  softWaitMs?: number;
  agentId?: string;
  conversationId?: string | null;
};

/**
 * Run a custom tool with Cursor-style soft-wait: wait up to softWaitMs for completion,
 * otherwise return taskId while the process continues in the background.
 */
export async function executeToolWithSoftWait(opts: ExecuteToolSoftWaitOptions): Promise<SoftWaitExecuteResult> {
  const softWaitMs = opts.softWaitMs ?? CUSTOM_TOOL_SOFT_WAIT_MS;
  await acquireSlot();
  let transferSlot = false;
  let prepared: PreparedRun | undefined;
  let inputPath: string | undefined;
  let handle: SpawnHandle | undefined;
  let hardTimer: ReturnType<typeof setTimeout> | undefined;

  try {
    const prep = await prepareToolRun(opts.toolId, opts.code, opts.dataDir);
    if ("errorJson" in prep) {
      return { status: "completed", payload: prep.errorJson };
    }
    prepared = prep;

    inputPath = await writeToolInputJson(prepared.sandboxDir, opts.inputJson);
    let attachedTaskId: string | null = null;
    let pendingLog = "";
    handle = await spawnCmd(process.execPath, [prepared.runPath], prepared.sandboxDir, toolRunEnv(prepared, inputPath), (chunk) => {
      if (attachedTaskId) bgTaskRegistry.appendLog(attachedTaskId, chunk);
      else {
        pendingLog += chunk;
        if (pendingLog.length > PENDING_LOG_MAX_CHARS) pendingLog = pendingLog.slice(-PENDING_LOG_MAX_CHARS);
      }
    });

    const hardMs = hardTimeoutMs();
    let hardTimedOut = false;
    hardTimer = setTimeout(() => {
      hardTimedOut = true;
      handle?.kill();
    }, hardMs);

    let softTimer: ReturnType<typeof setTimeout> | undefined;
    const softPromise = new Promise<"timeout">((resolve) => {
      softTimer = setTimeout(() => resolve("timeout"), Math.max(0, softWaitMs));
    });

    const raced = await Promise.race([handle.done.then((r) => ({ kind: "done" as const, r })), softPromise.then(() => ({ kind: "timeout" as const }))]);
    if (softTimer) clearTimeout(softTimer);

    if (raced.kind === "done") {
      clearTimeout(hardTimer);
      hardTimer = undefined;
      const payload = hardTimedOut ? JSON.stringify({ ok: false, error: `Tool timed out after ${hardMs}ms` }) : formatRunResult(raced.r);
      await cleanupPrepared(prepared, inputPath);
      prepared = undefined;
      return { status: "completed", payload };
    }

    const taskId = bgTaskRegistry.register({
      toolId: opts.toolId,
      toolName: opts.toolName,
      agentId: opts.agentId,
      conversationId: opts.conversationId,
      pid: handle.pid,
      kill: handle.kill,
    });
    attachedTaskId = taskId;
    if (pendingLog) bgTaskRegistry.appendLog(taskId, pendingLog);

    transferSlot = true;
    const prepForBg = prepared;
    const inputForBg = inputPath;
    const bgHandle = handle;
    prepared = undefined;
    inputPath = undefined;

    void (async () => {
      try {
        const r = await bgHandle.done;
        const payload = hardTimedOut ? JSON.stringify({ ok: false, error: `Tool timed out after ${hardMs}ms` }) : formatRunResult(r);
        bgTaskRegistry.finish(taskId, parseOutcomeFromResultJson(payload));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        bgTaskRegistry.finish(taskId, { ok: false, error: message });
      } finally {
        clearTimeout(hardTimer);
        try {
          await cleanupPrepared(prepForBg, inputForBg);
        } finally {
          releaseSlot();
        }
      }
    })();

    return { status: "running", taskId, toolName: opts.toolName };
  } finally {
    if (!transferSlot) {
      handle?.kill();
      if (hardTimer) clearTimeout(hardTimer);
      if (prepared) await cleanupPrepared(prepared, inputPath);
      releaseSlot();
    }
  }
}
