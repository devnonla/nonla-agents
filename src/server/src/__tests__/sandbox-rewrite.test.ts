import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { rewriteSandboxTs } from "../common/sandbox/rewrite-source.js";
import { tmpDir } from "../common/utils/data-dir.js";
import { _stopProxyHubForTests } from "../modules/tools/common/nonlaagents-proxy.js";
import { executeTool } from "../modules/tools/common/tool-runner.js";

describe("rewriteSandboxTs", () => {
  test("rewrites caret regex literals to new RegExp", () => {
    const out = rewriteSandboxTs(`const n = path.replace(/^\\/+|\\/+$/g, "");`);
    expect(out.startsWith("// @ts-nocheck\n")).toBe(true);
    expect(out).toContain(`new RegExp("^\\\\/+|\\\\/+$", "g")`);
    expect(out).not.toContain("/^");
  });

  test("rewrites a leading `/^` after ASI so Bun does not see Unexpected ^", () => {
    const out = rewriteSandboxTs(`const x = "hello"\n/^h/.test(x)\n`);
    expect(out).toContain(`new RegExp("^h")`);
    expect(out).not.toMatch(/\/\^h\//);
  });

  test("leaves regex inside strings and comments alone", () => {
    const src = `const s = "/^foo/";\n// /^bar/\n/* /^baz/ */\n`;
    const out = rewriteSandboxTs(src);
    expect(out).toContain('const s = "/^foo/";');
    expect(out).toContain("// /^bar/");
    expect(out).toContain("/* /^baz/ */");
  });

  test("rewrites caret regex inside template interpolations", () => {
    const out = rewriteSandboxTs('const s = `x ${path.replace(/^a/, "")} y`;');
    expect(out).toContain(`new RegExp("^a")`);
  });

  test("keeps an existing @ts-nocheck as the first directive", () => {
    const src = "// @ts-nocheck\nexport const n = 1;\n";
    expect(rewriteSandboxTs(src)).toBe(src);
  });
});

describe("sandbox executeTool caret regex", () => {
  let dataDir: string;

  afterEach(() => {
    _stopProxyHubForTests();
    if (dataDir) {
      try {
        rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  test("runs ASI `/^` and /^\\/+|\\/+$/g without Unexpected ^", async () => {
    dataDir = `${tmpDir()}/nonla-agents-sandbox-rewrite-${crypto.randomUUID()}`;
    const raw = await executeTool(
      "tool-caret-regex",
      `export default async function main(input: Record<string, unknown>) {
  const x = "hello"
  /^h/.test(x)
  const path = String(input.path ?? "")
  const normalized = path.replace(/^\\/+|\\/+$/g, "")
  try {
    throw new Error("boom")
  } catch (err: unknown) {
    const message: string = err instanceof Error ? err.message : (err as string)
    return { normalized, message }
  }
}`,
      JSON.stringify({ path: "/hello/world/" }),
      dataDir,
      30_000,
    );
    const parsed = JSON.parse(raw) as { ok: boolean; result?: { normalized: string; message: string }; error?: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.result?.normalized).toBe("hello/world");
    expect(parsed.result?.message).toBe("boom");
  }, 60_000);
});
