import { type SiteTree, getTreeDir } from "./sites-fs.js";

export async function installSiteDeps(siteId: string, tree: SiteTree): Promise<{ ok: true } | { ok: false; error: string }> {
  const cwd = getTreeDir(siteId, tree);
  const pkg = `${cwd}/package.json`;
  if (!(await Bun.file(pkg).exists())) {
    return { ok: false, error: "package.json not found" };
  }

  const proc = Bun.spawn(["bun", "install", "--ignore-scripts"], {
    cwd,
    env: { ...process.env, BUN_INSTALL_FROZEN_LOCKFILE: "0" },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  const timer = setTimeout(() => proc.kill("SIGKILL"), 120_000);
  try {
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    if (code === 0) return { ok: true };
    const detail = (stderr || stdout).trim().slice(0, 2000);
    return { ok: false, error: detail || `bun install exited with code ${code}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
