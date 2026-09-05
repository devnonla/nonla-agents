import { rmSync } from "node:fs";
import { BadRequestException, ServiceUnavailableException } from "../../common/exceptions/http.exception.js";
import { ensureWritableDir, readCapturedOutput, sandboxChildEnv, spawnCaptured, unlinkCaptured, wrapForSandbox } from "../../common/sandbox/index.js";
import { tmpDir } from "../../common/utils/data-dir.js";
import { startNonlaagentsProxy } from "../tools/common/nonlaagents-proxy.js";

const DEFAULT_WALL_MS = 15_000;
/** After soft kill, wait this long then SIGKILL + abandon stream reads. */
const WORKER_KILL_GRACE_MS = 2_000;

/**
 * `/data` and `/action` are public, unauthenticated hot paths (every site
 * page view hits them). Cap concurrent subprocess spawns so a traffic spike
 * or abuse can't fork-bomb the host; reject outright once the queue is full
 * instead of growing it unbounded.
 */
const MAX_CONCURRENT_WORKERS = 8;
const MAX_QUEUE_LENGTH = 64;
let activeWorkers = 0;
const workerQueue: Array<() => void> = [];

function acquireWorkerSlot(): Promise<void> {
  if (activeWorkers < MAX_CONCURRENT_WORKERS) {
    activeWorkers += 1;
    return Promise.resolve();
  }
  if (workerQueue.length >= MAX_QUEUE_LENGTH) {
    throw new ServiceUnavailableException("Site backend is busy — too many concurrent requests");
  }
  return new Promise((resolve) => {
    workerQueue.push(() => {
      activeWorkers += 1;
      resolve();
    });
  });
}

function releaseWorkerSlot() {
  activeWorkers = Math.max(0, activeWorkers - 1);
  const next = workerQueue.shift();
  if (next) next();
}

function workerWallMs(): number {
  const n = Number(process.env.SITE_BACKEND_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WALL_MS;
}

/** Dev: sibling .ts next to this module. Prod bundle: sites-backend-worker.js next to dist/index.js. */
function resolveWorkerPath(): string {
  const candidates = [`${import.meta.dir}/sites-backend-worker.js`, `${import.meta.dir}/sites-backend-worker.ts`];
  for (const path of candidates) {
    if (Bun.file(path).size > 0) return path;
  }
  return candidates[0];
}

async function serializeJsonFile(prefix: string, data: unknown): Promise<string> {
  const path = `${tmpDir()}/${prefix}-${crypto.randomUUID()}.json`;
  await Bun.write(path, JSON.stringify(data));
  return path;
}

async function serializeRequestToFile(request: Request): Promise<string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
  return serializeJsonFile("site-backend-req", {
    method: request.method,
    url: request.url,
    headers,
    body,
  });
}

function parseWorkerStdout(stdout: string): Record<string, unknown> {
  const lines = stdout
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      /* try previous line */
    }
  }
  throw new BadRequestException(`Backend worker returned invalid JSON: ${stdout.slice(0, 500)}`);
}

type CapturedWorker = Awaited<ReturnType<typeof spawnCaptured>>;

function killWorker(proc: CapturedWorker, signal?: number | NodeJS.Signals) {
  proc.kill(signal);
}

async function awaitWorker(proc: CapturedWorker, wallMs: number): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  let killedForTimeout = false;
  const finished = proc.exited.then((exitCode) => ({
    exitCode,
    timedOut: false as const,
  }));

  let wallTimer: ReturnType<typeof setTimeout> | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  const wall = new Promise<{ exitCode: number; timedOut: true }>((resolve) => {
    wallTimer = setTimeout(() => {
      killedForTimeout = true;
      killWorker(proc);
      graceTimer = setTimeout(() => {
        killWorker(proc, "SIGKILL");
        resolve({ exitCode: -1, timedOut: true });
      }, WORKER_KILL_GRACE_MS);
    }, wallMs);
  });

  try {
    const outcome = await Promise.race([finished, wall]);
    const { stdout, stderr } = await readCapturedOutput(proc);
    if (killedForTimeout || outcome.timedOut) {
      await Promise.race([finished.catch(() => undefined), new Promise<void>((r) => setTimeout(r, 500))]);
      return { stdout, stderr, exitCode: -1, timedOut: true };
    }
    return { stdout, stderr, exitCode: outcome.exitCode, timedOut: false };
  } finally {
    if (wallTimer) clearTimeout(wallTimer);
    if (graceTimer) clearTimeout(graceTimer);
  }
}

async function unlinkQuiet(path: string | undefined) {
  if (!path) return;
  await Bun.file(path)
    .delete()
    .catch(() => undefined);
}

function rmQuiet(dir: string | undefined) {
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export async function runSiteBackendWorker(opts: {
  runtimeDir: string;
  treeDir: string;
  request: Request;
  query?: Record<string, string>;
  params?: Record<string, string>;
}): Promise<{ value: unknown }> {
  await acquireWorkerSlot();

  const proxy = startNonlaagentsProxy();
  let requestPath: string | undefined;
  let queryPath: string | undefined;
  let paramsPath: string | undefined;
  let bunTmp: string | undefined;
  let captured: CapturedWorker | undefined;
  const wallMs = workerWallMs();

  try {
    requestPath = await serializeRequestToFile(opts.request);
    queryPath = await serializeJsonFile("site-backend-query", opts.query ?? {});
    paramsPath = await serializeJsonFile("site-backend-params", opts.params ?? {});
    bunTmp = ensureWritableDir(`${tmpDir()}/site-backend-${crypto.randomUUID()}`);

    const workerPath = resolveWorkerPath();
    if (Bun.file(workerPath).size === 0) {
      throw new BadRequestException(`Backend worker not found at ${workerPath}`);
    }

    const argv = await wrapForSandbox([process.execPath, workerPath], { cwd: opts.treeDir, writablePaths: [bunTmp] });
    captured = await spawnCaptured(argv, {
      cwd: opts.treeDir,
      env: sandboxChildEnv({
        SITE_RUNTIME_DIR: opts.runtimeDir,
        SITE_TREE_DIR: opts.treeDir,
        SITE_REQUEST_PATH: requestPath,
        SITE_QUERY_PATH: queryPath,
        SITE_PARAMS_PATH: paramsPath,
        NONLAAGENTS_URL: proxy.url,
        NONLAAGENTS_TOKEN: proxy.token,
        TMPDIR: bunTmp,
        TMP: bunTmp,
        TEMP: bunTmp,
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: `${bunTmp}/bun-cache`,
      }),
    });

    const { stdout, stderr, timedOut } = await awaitWorker(captured, wallMs);

    if (timedOut) {
      throw new BadRequestException(`Backend worker timed out after ${wallMs}ms`);
    }

    let payload: Record<string, unknown>;
    try {
      payload = parseWorkerStdout(stdout);
    } catch (err) {
      const detail = (stderr || stdout).trim().slice(0, 1500);
      if (detail) throw new BadRequestException(`Backend worker failed: ${detail}`);
      throw err;
    }

    if (!payload.ok) {
      const error = typeof payload.error === "string" ? payload.error : "Backend worker failed";
      throw new BadRequestException(error);
    }

    return { value: payload.value };
  } finally {
    proxy.stop();
    releaseWorkerSlot();
    rmQuiet(bunTmp);
    await Promise.all([unlinkQuiet(requestPath), unlinkQuiet(queryPath), unlinkQuiet(paramsPath), captured ? unlinkCaptured(captured) : undefined]);
  }
}
