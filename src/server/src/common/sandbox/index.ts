/**
 * Platform dispatcher for OS-level sandboxing of untrusted user code
 * (custom tools, site `backend.ts`). Picks the best available backend and
 * falls back to running unwrapped when none is usable.
 *
 *   - Linux (Docker prod image, or bare-metal Linux): bubblewrap.
 *     Requires the `bubblewrap` package and, inside Docker,
 *     `security_opt: [seccomp:unconfined]` (see docker-compose.yml).
 *   - macOS (`bun run dev` / `bun run start` from source): Apple Seatbelt
 *     via `sandbox-exec`, built into the OS, no setup needed.
 *   - Windows and anything else: no backend yet. Logged once so operators
 *     know children run unsandboxed; the Docker image is the recommended
 *     way to get the sandbox.
 */

import { mkdirSync, realpathSync } from "node:fs";
import { isBwrapAvailable, wrapForSandbox as wrapWithBwrap } from "./bwrap.js";
import { SANDBOX_ENV_ALLOWLIST, sandboxChildEnv } from "./env.js";
import { isSeatbeltAvailable, wrapForSandbox as wrapWithSeatbelt } from "./seatbelt.js";
import type { SandboxWrapOpts } from "./types.js";

export type { SandboxWrapOpts } from "./types.js";
export { detectPackages, isPkgInstalled, packageNameFromSpecifier } from "./detect-packages.js";
export { SANDBOX_TSCONFIG, rewriteSandboxTs } from "./rewrite-source.js";
export { SANDBOX_ENV_ALLOWLIST, sandboxChildEnv };
export { spawnCaptured, readCapturedOutput, unlinkCaptured, type CapturedSpawn } from "./spawn-captured.js";

let warnedUnsupportedPlatform = false;

export async function isSandboxAvailable(): Promise<boolean> {
  if (process.platform === "linux") return isBwrapAvailable();
  if (process.platform === "darwin") return isSeatbeltAvailable();
  return false;
}

/** mkdir + realpath so Seatbelt `subpath` and bwrap `--bind` match the on-disk path (macOS /var → /private/var). */
export function ensureWritableDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  try {
    return realpathSync(dir);
  } catch {
    return dir;
  }
}

export async function wrapForSandbox(command: string[], opts: SandboxWrapOpts): Promise<string[]> {
  if (process.platform === "linux") return wrapWithBwrap(command, opts);
  if (process.platform === "darwin") return wrapWithSeatbelt(command, opts);

  if (!warnedUnsupportedPlatform) {
    warnedUnsupportedPlatform = true;
    console.warn(`[sandbox] No sandbox backend for platform "${process.platform}" — children run unsandboxed. Use the Docker image for sandboxed execution.`);
  }
  return command;
}
