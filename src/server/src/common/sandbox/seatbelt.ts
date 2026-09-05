/**
 * macOS sandbox via Apple Seatbelt (`sandbox-exec`). Same policy intent as
 * the Linux bwrap backend: read-only filesystem except optional writable
 * subpaths, network left open for the loopback nonlaagents proxy.
 *
 * `sandbox-exec` is deprecated but has no replacement for "sandbox an
 * arbitrary subprocess from a server" — Chrome, Cursor, Codex CLI, and
 * Claude Code all still use it for this on macOS.
 */

import { readCapturedOutput, spawnCaptured, unlinkCaptured } from "./spawn-captured.js";
import type { SandboxWrapOpts } from "./types.js";

function seatbeltString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function seatbeltProfile(writablePaths: string[] = []): string {
  const seen = new Set<string>();
  const writeRules: string[] = ["(deny file-write*)"];
  for (const p of writablePaths) {
    if (!p || p === "/" || seen.has(p)) continue;
    seen.add(p);
    writeRules.push(`(allow file-write* (subpath "${seatbeltString(p)}"))`);
  }

  return `(version 1)
(deny default)
(allow file-read*)
${writeRules.join("\n")}
(allow process-fork)
(allow process-exec)
(allow network*)
(allow signal (target self))
(allow sysctl-read)
(allow mach-lookup)
(allow iokit-open)
`;
}

/** Deny-all-writes profile used for the one-time availability probe. */
const PROBE_PROFILE = seatbeltProfile([]);

let availability: Promise<boolean> | undefined;

async function probeSeatbelt(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  if (!Bun.which("sandbox-exec")) return false;

  const captured = await spawnCaptured(["sandbox-exec", "-p", PROBE_PROFILE, "true"]);
  try {
    const exitCode = await captured.exited;
    const { stderr: stderrText } = await readCapturedOutput(captured);
    if (exitCode !== 0) {
      console.warn(`[sandbox] Seatbelt unavailable, running unsandboxed: ${stderrText.trim().slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[sandbox] Seatbelt not usable, running unsandboxed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    await unlinkCaptured(captured);
  }
}

export function isSeatbeltAvailable(): Promise<boolean> {
  if (!availability) availability = probeSeatbelt();
  return availability;
}

/**
 * Wraps `command` to run under Seatbelt when available, otherwise returns it
 * unchanged. Unlike bwrap, `sandbox-exec` doesn't touch cwd — the caller's
 * `Bun.spawn({ cwd })` still applies.
 */
export async function wrapForSandbox(command: string[], opts: SandboxWrapOpts): Promise<string[]> {
  if (!(await isSeatbeltAvailable())) return command;
  return ["sandbox-exec", "-p", seatbeltProfile(opts.writablePaths), ...command];
}
