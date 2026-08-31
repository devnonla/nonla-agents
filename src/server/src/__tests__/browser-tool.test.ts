import { afterAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { runBrowserActions } from "../common/ai/agent-tools/browser-runner.js";
import { tmpDir } from "../common/utils/data-dir.js";

describe("browser-runner", () => {
  const prevDataDir = process.env.DATA_DIR;
  const dataDir = `${tmpDir()}/nonla-agents-browser-${crypto.randomUUID()}`;

  afterAll(() => {
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  process.env.DATA_DIR = dataDir;

  test("rejects empty actions", async () => {
    const result = await runBrowserActions([]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("non-empty");
  });

  test("navigate + snapshot on example.com", async () => {
    const result = await runBrowserActions([{ action: "navigate", url: "https://example.com" }, { action: "snapshot" }]);

    expect(result.ok).toBe(true);
    expect(result.url).toContain("example.com");
    expect(result.results).toHaveLength(2);
    expect(result.results[0].ok).toBe(true);
    expect(result.results[1].ok).toBe(true);
    expect(result.results[1].content?.toLowerCase()).toContain("example");
  }, 60_000);

  test("stops on failed action", async () => {
    const result = await runBrowserActions([{ action: "navigate", url: "https://example.com" }, { action: "click", selector: "#does-not-exist-ever" }, { action: "snapshot" }]);

    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(result.results[1].ok).toBe(false);
    expect(result.results[1].error).toBeTruthy();
  }, 60_000);
});
