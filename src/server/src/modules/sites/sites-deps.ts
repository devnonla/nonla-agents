import { detectPackages, isPkgInstalled } from "../../common/sandbox/index.js";
import { type SiteTree, getTreeDir, readSourceFile } from "./sites-fs.js";

const INSTALL_TIMEOUT_MS = 120_000;
const installLocks = new Map<string, Promise<unknown>>();

async function withInstallLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = installLocks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  installLocks.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

async function runBunInTree(cwd: string, args: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const proc = Bun.spawn([process.execPath, ...args], {
    cwd,
    env: { ...process.env, BUN_INSTALL_FROZEN_LOCKFILE: "0" },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  const timer = setTimeout(() => proc.kill("SIGKILL"), INSTALL_TIMEOUT_MS);
  try {
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    if (code === 0) return { ok: true };
    const detail = (stderr || stdout).trim().slice(0, 2000);
    return { ok: false, error: detail || `bun ${args[0] ?? "install"} exited with code ${code}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function installSiteDeps(siteId: string, tree: SiteTree): Promise<{ ok: true } | { ok: false; error: string }> {
  const cwd = getTreeDir(siteId, tree);
  const pkg = `${cwd}/package.json`;
  if (!(await Bun.file(pkg).exists())) {
    return { ok: false, error: "package.json not found" };
  }

  return withInstallLock(`${siteId}:${tree}`, () => runBunInTree(cwd, ["install", "--ignore-scripts"]));
}

export function detectSitePackages(siteId: string, tree: SiteTree): string[] {
  const app = readSourceFile(siteId, tree, "app.tsx");
  const backend = readSourceFile(siteId, tree, "backend.ts");
  return [...new Set([...detectPackages(app), ...detectPackages(backend)])];
}

/**
 * Scan app.tsx + backend.ts imports and `bun add` anything not yet in node_modules.
 * Updates package.json the same way tools do — the agent does not need to edit it.
 */
export async function ensureSitePackages(siteId: string, tree: SiteTree): Promise<{ ok: true; added: string[] } | { ok: false; error: string; added?: undefined }> {
  const cwd = getTreeDir(siteId, tree);
  if (!(await Bun.file(`${cwd}/package.json`).exists())) {
    return { ok: false, error: "package.json not found" };
  }

  return withInstallLock(`${siteId}:${tree}`, async () => {
    const pkgs = detectSitePackages(siteId, tree);
    const missing = pkgs.filter((p) => !isPkgInstalled(cwd, p));
    if (missing.length === 0) return { ok: true as const, added: [] };

    const result = await runBunInTree(cwd, ["add", "--ignore-scripts", ...missing]);
    if (!result.ok) return { ok: false as const, error: `Package install failed [${missing.join(", ")}]:\n${result.error}` };
    return { ok: true as const, added: missing };
  });
}
