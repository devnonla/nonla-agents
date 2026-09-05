import { afterEach, describe, expect, test } from "bun:test";
import { closeSync, openSync } from "node:fs";
import { readCapturedOutput, spawnCaptured, unlinkCaptured } from "../common/sandbox/spawn-captured.js";

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
});
