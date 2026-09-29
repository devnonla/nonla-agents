/**
 * Spawn a child and capture stdout/stderr without posix_spawn pipe FDs.
 *
 * On macOS, `posix_spawn` file actions reject descriptors ≥ OPEN_MAX (10240).
 * `bun --watch` retains directory FDs past that, so `Bun.spawn({ stdout: "pipe" })`
 * throws `EBADF: bad file descriptor, posix_spawn`. Inherited stdio uses fds
 * 0/1/2 (always below the cap); the shell then redirects to files via `open()`.
 *
 * stdin is redirected from /dev/null (or `stdinPath`) so untrusted children do not share the TTY.
 */

import { closeSync, openSync, readSync, statSync } from "node:fs";
import { tmpDir } from "../utils/data-dir.js";

const REDIRECT = 'exec "$@" < "$NL_SPAWN_STDIN" > "$NL_SPAWN_STDOUT" 2> "$NL_SPAWN_STDERR"';

export type CapturedSpawn = {
  pid: number;
  exited: Promise<number>;
  kill: (signal?: number | NodeJS.Signals) => void;
  stdoutPath: string;
  stderrPath: string;
};

function envRecord(src: Record<string, string | undefined> | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(src ?? process.env)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}

export async function spawnCaptured(
  argv: string[],
  opts: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdinPath?: string;
  } = {},
): Promise<CapturedSpawn> {
  const id = crypto.randomUUID();
  const stdoutPath = `${tmpDir()}/nl-spawn-out-${id}`;
  const stderrPath = `${tmpDir()}/nl-spawn-err-${id}`;
  await Bun.write(stdoutPath, "");
  await Bun.write(stderrPath, "");

  const env = envRecord(opts.env);
  env.NL_SPAWN_STDIN = opts.stdinPath || "/dev/null";
  env.NL_SPAWN_STDOUT = stdoutPath;
  env.NL_SPAWN_STDERR = stderrPath;

  try {
    const proc = Bun.spawn(["/bin/sh", "-c", REDIRECT, "nl-spawn", ...argv], {
      cwd: opts.cwd,
      env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    return {
      pid: proc.pid,
      exited: proc.exited,
      kill: (signal?: number | NodeJS.Signals) => {
        try {
          if (signal === undefined) proc.kill();
          else proc.kill(signal);
        } catch {
          /* already exited */
        }
      },
      stdoutPath,
      stderrPath,
    };
  } catch (err) {
    await unlinkCaptured({ stdoutPath, stderrPath });
    throw err;
  }
}

export async function readCapturedOutput(spawn: Pick<CapturedSpawn, "stdoutPath" | "stderrPath">): Promise<{ stdout: string; stderr: string }> {
  const [stdout, stderr] = await Promise.all([
    Bun.file(spawn.stdoutPath)
      .text()
      .catch(() => ""),
    Bun.file(spawn.stderrPath)
      .text()
      .catch(() => ""),
  ]);
  return { stdout, stderr };
}

/**
 * Emit new bytes from a capture file until `until` settles, then flush the tail.
 * Used for live job/tool logs without creating posix_spawn pipe FDs.
 */
export async function followCaptureFile(path: string, onChunk: (piece: string) => void, until: Promise<unknown>, intervalMs = 80): Promise<void> {
  let offset = 0;

  const readNew = () => {
    try {
      const size = statSync(path).size;
      if (size <= offset) return;
      const fd = openSync(path, "r");
      try {
        const length = size - offset;
        const buf = Buffer.alloc(length);
        const n = readSync(fd, buf, 0, length, offset);
        if (n > 0) {
          offset += n;
          onChunk(buf.subarray(0, n).toString("utf8"));
        }
      } finally {
        closeSync(fd);
      }
    } catch {
      /* file not ready yet */
    }
  };

  while (true) {
    readNew();
    const settled = await Promise.race([until.then(() => true as const), Bun.sleep(intervalMs).then(() => false as const)]);
    if (settled) {
      readNew();
      return;
    }
  }
}

export async function unlinkCaptured(spawn: Partial<Pick<CapturedSpawn, "stdoutPath" | "stderrPath">>): Promise<void> {
  await Promise.all([
    spawn.stdoutPath
      ? Bun.file(spawn.stdoutPath)
          .delete()
          .catch(() => undefined)
      : undefined,
    spawn.stderrPath
      ? Bun.file(spawn.stderrPath)
          .delete()
          .catch(() => undefined)
      : undefined,
  ]);
}
