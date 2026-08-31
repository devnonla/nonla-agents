/**
 * Linux OS-level sandbox via bubblewrap (bwrap): kernel namespaces + a
 * read-only filesystem view, with optional writable overlays.
 *
 * Network stays shared with the host so children can reach the loopback
 * nonlaagents proxy. This does not allowlist egress.
 *
 * bwrap needs to create kernel namespaces (`clone`/`unshare`), which Docker's
 * default seccomp profile blocks even for root. That's why docker-compose.yml
 * sets `security_opt: [seccomp:unconfined]`. When bwrap is missing or the
 * container's seccomp/kernel doesn't allow namespace creation, we fall back
 * to running unwrapped.
 */

import type { SandboxWrapOpts } from "./types.js";

let availability: Promise<boolean> | undefined;

function bwrapArgv(command: string[], opts: SandboxWrapOpts): string[] {
  const binds: string[] = [];
  const seen = new Set<string>();
  for (const p of opts.writablePaths ?? []) {
    if (!p || p === "/" || seen.has(p)) continue;
    seen.add(p);
    binds.push("--bind", p, p);
  }

  return [
    "bwrap",
    "--die-with-parent",
    // Guards against TIOCSTI-style out-of-sandbox command injection into the
    // parent's terminal (CVE-2017-5226) — cheap and recommended even though
    // stdin is already "ignore" for these workers.
    "--new-session",
    "--unshare-user-try",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    "--unshare-cgroup-try",
    "--cap-drop",
    "ALL",
    "--ro-bind",
    "/",
    "/",
    ...binds,
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--chdir",
    opts.cwd,
    "--",
    ...command,
  ];
}

async function probeBwrap(): Promise<boolean> {
  if (process.platform !== "linux") return false;
  if (!Bun.which("bwrap")) return false;

  try {
    const proc = Bun.spawn(bwrapArgv(["true"], { cwd: "/" }), {
      stdout: "ignore",
      stderr: "pipe",
      stdin: "ignore",
    });
    const [exitCode, stderrText] = await Promise.all([proc.exited, new Response(proc.stderr!).text()]);
    if (exitCode !== 0) {
      console.warn(`[sandbox] bubblewrap unavailable, running unsandboxed: ${stderrText.trim().slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[sandbox] bubblewrap not usable, running unsandboxed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** Cached for the process lifetime — the probe result can't change without a restart. */
export function isBwrapAvailable(): Promise<boolean> {
  if (!availability) availability = probeBwrap();
  return availability;
}

export async function wrapForSandbox(command: string[], opts: SandboxWrapOpts): Promise<string[]> {
  if (!(await isBwrapAvailable())) return command;
  return bwrapArgv(command, opts);
}
