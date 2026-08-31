import { rmSync } from "node:fs";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { getDataDir } from "../../common/utils/data-dir.js";
import { startNonlaagentsProxy } from "../tools/common/nonlaagents-proxy.js";
import { type JobLogEntry, createLineBuffer } from "./common/job-logs.js";
import { JOBS_NONLAAGENTS_INDEX_TS, JOBS_NONLAAGENTS_LEGACY_PACKAGE_JSON, JOBS_NONLAAGENTS_PACKAGE_JSON } from "./jobs-nonlaagents.js";
import { appendRunLogEntries, finishJobRun, getDraftCode, getJob, getJobRun, toPublicJobRun, tryClaimJob } from "./jobs.service.js";

const MAX_CONCURRENT = 3;
let activeRuns = 0;
const queue: Array<() => void> = [];

/** In-flight run abort controllers — keyed by runId. */
const runAborts = new Map<string, AbortController>();

function acquireSlot(): Promise<void> {
  if (activeRuns < MAX_CONCURRENT) {
    activeRuns += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      activeRuns += 1;
      resolve();
    });
  });
}

function releaseSlot() {
  activeRuns = Math.max(0, activeRuns - 1);
  const next = queue.shift();
  if (next) next();
}

async function writeWorkspace(runId: string, code: string): Promise<string> {
  const dir = `${getDataDir()}/job_workspaces/${runId}`;
  const pkgDir = `${dir}/node_modules/@nonla-agents/runtime`;
  await Bun.write(`${pkgDir}/package.json`, JOBS_NONLAAGENTS_PACKAGE_JSON);
  await Bun.write(`${pkgDir}/index.ts`, JOBS_NONLAAGENTS_INDEX_TS);

  const legacyPkgDir = `${dir}/node_modules/nonlaagents`;
  await Bun.write(`${legacyPkgDir}/package.json`, JOBS_NONLAAGENTS_LEGACY_PACKAGE_JSON);
  await Bun.write(`${legacyPkgDir}/index.ts`, JOBS_NONLAAGENTS_INDEX_TS);

  await Bun.write(`${dir}/package.json`, JSON.stringify({ name: `job-run-${runId}`, type: "module" }));
  await Bun.write(`${dir}/main.ts`, code);
  return dir;
}

function cleanupWorkspace(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

async function readStreamLive(stream: ReadableStream<Uint8Array> | null, onChunk: (text: string) => void): Promise<void> {
  if (!stream) return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) onChunk(text);
    }
    const tail = decoder.decode();
    if (tail) onChunk(tail);
  } catch {
    /* aborted / closed */
  }
}

export async function runBunScript(opts: {
  code: string;
  workspaceId: string;
  timeoutMs: number;
  startedAtMs?: number;
  onLogEntries?: (entries: JobLogEntry[]) => void;
  abortSignal?: AbortSignal;
}): Promise<{ exitCode: number; entries: JobLogEntry[]; timedOut: boolean; cancelled: boolean }> {
  const proxy = startNonlaagentsProxy();
  const workspace = await writeWorkspace(opts.workspaceId, opts.code);
  const startedAtMs = opts.startedAtMs ?? Date.now();
  const entries: JobLogEntry[] = [];
  const onLogEntries = opts.onLogEntries ?? (() => {});

  const pushEntries = (batch: JobLogEntry[]) => {
    entries.push(...batch);
    onLogEntries(batch);
  };

  try {
    if (opts.abortSignal?.aborted) {
      return { exitCode: 1, entries, timedOut: false, cancelled: true };
    }

    const proc = Bun.spawn(["bun", "run", "main.ts"], {
      cwd: workspace,
      env: {
        ...process.env,
        NONLAAGENTS_URL: proxy.url,
        NONLAAGENTS_TOKEN: proxy.token,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    let timedOut = false;
    let cancelled = false;

    const killProc = () => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    };

    const killer = setTimeout(() => {
      timedOut = true;
      killProc();
    }, opts.timeoutMs);

    const onAbort = () => {
      cancelled = true;
      killProc();
    };
    opts.abortSignal?.addEventListener("abort", onAbort, { once: true });
    if (opts.abortSignal?.aborted) onAbort();

    const stdoutBuf = createLineBuffer("stdout", startedAtMs, pushEntries);
    const stderrBuf = createLineBuffer("stderr", startedAtMs, pushEntries);

    const [, , exitCode] = await Promise.all([readStreamLive(proc.stdout, (chunk) => stdoutBuf.push(chunk)), readStreamLive(proc.stderr, (chunk) => stderrBuf.push(chunk)), proc.exited]);
    clearTimeout(killer);
    opts.abortSignal?.removeEventListener("abort", onAbort);
    stdoutBuf.flush();
    stderrBuf.flush();

    return { exitCode, entries, timedOut, cancelled };
  } finally {
    proxy.stop();
    cleanupWorkspace(workspace);
  }
}

export async function executeJobRun(opts: {
  jobId: string;
  runId: string;
  advanceSchedule: boolean;
  codeOverride?: string;
}): Promise<void> {
  const abort = new AbortController();
  runAborts.set(opts.runId, abort);

  await acquireSlot();

  try {
    if (abort.signal.aborted) {
      finishJobRun({
        jobId: opts.jobId,
        runId: opts.runId,
        status: "failed",
        logs: [{ t: 0, level: "system", message: "Cancelled", kind: "system" }],
        error: "Cancelled",
        advanceSchedule: opts.advanceSchedule,
      });
      return;
    }

    const job = getJob(opts.jobId);
    if (!job) {
      finishJobRun({
        jobId: opts.jobId,
        runId: opts.runId,
        status: "failed",
        logs: [],
        error: "Job not found",
        advanceSchedule: opts.advanceSchedule,
      });
      return;
    }

    const run = getJobRun(opts.runId);
    const startedAtMs = run?.startedAt ? new Date(run.startedAt).getTime() : Date.now();
    const code = opts.codeOverride ?? job.code;
    const timeoutMs = job.timeoutMs > 0 ? job.timeoutMs : 300_000;

    appendRunLogEntries(opts.runId, [{ t: 0, level: "system", message: "Run started", kind: "system" }]);

    const result = await runBunScript({
      code,
      workspaceId: opts.runId,
      timeoutMs,
      startedAtMs,
      abortSignal: abort.signal,
      onLogEntries: (batch) => appendRunLogEntries(opts.runId, batch),
    });

    const live = getJobRun(opts.runId);
    const logs = live ? undefined : result.entries;

    if (result.cancelled || abort.signal.aborted) {
      finishJobRun({
        jobId: opts.jobId,
        runId: opts.runId,
        status: "failed",
        logs,
        error: "Cancelled",
        advanceSchedule: opts.advanceSchedule,
      });
      return;
    }

    if (result.timedOut) {
      finishJobRun({
        jobId: opts.jobId,
        runId: opts.runId,
        status: "failed",
        logs,
        error: `Timed out after ${timeoutMs}ms`,
        advanceSchedule: opts.advanceSchedule,
      });
      return;
    }

    if (result.exitCode !== 0) {
      finishJobRun({
        jobId: opts.jobId,
        runId: opts.runId,
        status: "failed",
        logs,
        error: `Exited with code ${result.exitCode}`,
        advanceSchedule: opts.advanceSchedule,
      });
      return;
    }

    finishJobRun({
      jobId: opts.jobId,
      runId: opts.runId,
      status: "success",
      logs,
      error: null,
      advanceSchedule: opts.advanceSchedule,
    });
  } catch (err) {
    if (abort.signal.aborted) {
      finishJobRun({
        jobId: opts.jobId,
        runId: opts.runId,
        status: "failed",
        logs: undefined,
        error: "Cancelled",
        advanceSchedule: opts.advanceSchedule,
      });
      return;
    }
    finishJobRun({
      jobId: opts.jobId,
      runId: opts.runId,
      status: "failed",
      logs: undefined,
      error: err instanceof Error ? err.message : String(err),
      advanceSchedule: opts.advanceSchedule,
    });
  } finally {
    runAborts.delete(opts.runId);
    releaseSlot();
  }
}

/** Cancel a running job run — kills the Bun process and marks the run failed. */
export function cancelJobRun(jobId: string, runId: string) {
  const run = getJobRun(runId);
  if (!run || run.jobId !== jobId) throw new BadRequestException("Run not found");
  if (run.status !== "running") throw new BadRequestException("Run is not running");

  const abort = runAborts.get(runId);
  if (abort) {
    abort.abort();
    appendRunLogEntries(runId, [{ t: Math.max(0, Date.now() - new Date(run.startedAt).getTime()), level: "system", message: "Cancel requested", kind: "system" }]);
    return toPublicJobRun(getJobRun(runId)!);
  }

  // Process not tracked (orphaned / different instance) — mark failed and clear lease
  finishJobRun({
    jobId,
    runId,
    status: "failed",
    logs: undefined,
    error: "Cancelled",
    advanceSchedule: false,
  });
  return toPublicJobRun(getJobRun(runId)!);
}

/** Start a draft run for the coding agent — returns immediately; logs stream in Runs. */
export function runDraftJobCode(jobId: string): { started: boolean; runId?: string; error?: string } {
  const job = getJob(jobId);
  if (!job) return { started: false, error: "Job not found" };
  const code = getDraftCode(jobId);
  if (!code?.trim()) return { started: false, error: "No draft code available. Use edit_code first." };

  const claimed = tryClaimJob(jobId, "manual");
  if (!claimed) {
    return { started: false, error: "Job is already running or could not be claimed" };
  }

  void executeJobRun({
    jobId,
    runId: claimed.run.id,
    advanceSchedule: false,
    codeOverride: code,
  });

  return { started: true, runId: claimed.run.id };
}

/** Fire-and-forget run after a successful claim. */
export function startClaimedRun(jobId: string, runId: string, advanceSchedule: boolean) {
  void executeJobRun({ jobId, runId, advanceSchedule });
}
