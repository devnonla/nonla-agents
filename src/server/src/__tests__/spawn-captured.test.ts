import { afterEach, describe, expect, test } from "bun:test";
import { closeSync, openSync } from "node:fs";
import { wrapForSandbox } from "../common/sandbox/index.js";
import { followCaptureFile, readCapturedOutput, spawnCaptured, unlinkCaptured } from "../common/sandbox/spawn-captured.js";
import { tmpDir } from "../common/utils/data-dir.js";

describe("spawnCaptured", () => {
  const fds: number[] = [];

  afterEach(async () => {
    for (const fd of fds.splice(0)) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  });

  test("captures stdout via inherited stdio + file redirect", async () => {
    const captured = await spawnCaptured(["/bin/echo", "hello-captured"]);
    try {
      const code = await captured.exited;
      const { stdout, stderr } = await readCapturedOutput(captured);
      expect(code).toBe(0);
      expect(stdout.trim()).toBe("hello-captured");
      expect(stderr).toBe("");
    } finally {
      await unlinkCaptured(captured);
    }
  });

  test("feeds stdin from a file", async () => {
    const stdinPath = `${tmpDir()}/nl-spawn-in-${crypto.randomUUID()}`;
    await Bun.write(stdinPath, "from-stdin\n");
    const captured = await spawnCaptured(["/bin/cat"], { stdinPath });
    try {
      const code = await captured.exited;
      const { stdout } = await readCapturedOutput(captured);
      expect(code).toBe(0);
      expect(stdout).toBe("from-stdin\n");
    } finally {
      await unlinkCaptured(captured);
      await Bun.file(stdinPath)
        .delete()
        .catch(() => undefined);
    }
  });

  test("followCaptureFile emits bytes as the child writes", async () => {
    const captured = await spawnCaptured(["/bin/sh", "-c", "printf first; sleep 0.2; printf second"]);
    try {
      const chunks: string[] = [];
      await followCaptureFile(captured.stdoutPath, (piece) => chunks.push(piece), captured.exited);
      expect(chunks.join("")).toBe("firstsecond");
    } finally {
      await unlinkCaptured(captured);
    }
  });

  test("still captures output when the process holds many descriptors", async () => {
    for (let i = 0; i < 11_000; i++) {
      try {
        fds.push(openSync("/dev/null", "r"));
      } catch {
        break;
      }
    }
    expect(fds.length).toBeGreaterThan(1_000);

    const captured = await spawnCaptured(["/bin/echo", "still-ok"]);
    try {
      const code = await captured.exited;
      const { stdout } = await readCapturedOutput(captured);
      expect(code).toBe(0);
      expect(stdout.trim()).toBe("still-ok");
    } finally {
      await unlinkCaptured(captured);
    }
  });

  test("sandbox-exec wrapped command does not posix_spawn EBADF under many fds", async () => {
    if (process.platform !== "darwin") return;

    for (let i = 0; i < 11_000; i++) {
      try {
        fds.push(openSync("/dev/null", "r"));
      } catch {
        break;
      }
    }
    expect(fds.length).toBeGreaterThan(1_000);

    const argv = await wrapForSandbox(["/bin/echo", "seatbelt-ok"], { cwd: tmpDir(), writablePaths: [] });
    expect(argv[0]).toBe("sandbox-exec");

    const captured = await spawnCaptured(argv);
    try {
      const code = await captured.exited;
      const { stdout, stderr } = await readCapturedOutput(captured);
      expect(code).toBe(0);
      expect(stdout.trim()).toBe("seatbelt-ok");
      expect(stderr).toBe("");
    } finally {
      await unlinkCaptured(captured);
    }
  });
});
