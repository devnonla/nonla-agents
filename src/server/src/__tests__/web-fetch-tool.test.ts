import { afterEach, describe, expect, test } from "bun:test";
import { _setLightpandaRunnerForTest, lightpandaReleaseAsset, runWebFetch } from "../common/ai/agent-tools/web-fetch.tool.js";

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Hello Article</title><style>.x{color:red}</style></head>
<body>
  <nav>Home | About | Contact</nav>
  <article>
    <h1>Hello Article</h1>
    <p>This is the <strong>main</strong> content for LLM tests.</p>
    <ul><li>One</li><li>Two</li></ul>
  </article>
  <footer>Copyright 2026</footer>
  <script>alert("x")</script>
</body>
</html>`;

describe("runWebFetch", () => {
  afterEach(() => {
    _setLightpandaRunnerForTest(null);
  });

  test("rejects non-http schemes", async () => {
    const result = await runWebFetch({ url: "file:///etc/passwd" });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toMatch(/http/i);
  });

  test("clips long text", async () => {
    const long = "a".repeat(20_000);
    _setLightpandaRunnerForTest({
      resolveBin: () => "/usr/local/bin/lightpanda",
      run: async () => ({ code: 0, stdout: long, stderr: "" }),
    });
    const result = await runWebFetch({ url: "https://example.com/long.txt", max_chars: 1000, output: "md" });
    expect(result.ok).toBe(true);
    expect(result.engine).toBe("browser");
    expect(result.truncated).toBe(true);
    expect(result.length).toBe(20_000);
    expect(String(result.text).startsWith("a".repeat(1000))).toBe(true);
    expect(String(result.text)).toContain("[truncated: showing 1000 of 20000 chars]");
  });

  test("html output returns full dumped DOM including script", async () => {
    _setLightpandaRunnerForTest({
      resolveBin: () => "/usr/local/bin/lightpanda",
      run: async (_bin, args) => {
        expect(args).toContain("html");
        return { code: 0, stdout: SAMPLE_HTML, stderr: "" };
      },
    });
    const result = await runWebFetch({
      url: "https://example.com/post",
      output: "html",
    });
    expect(result.ok).toBe(true);
    expect(result.output).toBe("html");
    expect(String(result.text)).toContain("<script>");
    expect(String(result.text)).toContain("alert(");
    expect(String(result.text)).toContain("<style>");
  });

  test("md dump is used as-is", async () => {
    _setLightpandaRunnerForTest({
      resolveBin: () => "/usr/local/bin/lightpanda",
      run: async () => ({ code: 0, stdout: "# Hello world\n\nFrom markdown dump.", stderr: "" }),
    });
    const result = await runWebFetch({
      url: "https://example.com/api",
      output: "md",
    });
    expect(result.ok).toBe(true);
    expect(result.engine).toBe("browser");
    expect(String(result.text)).toContain("Hello world");
  });

  test("snapshot uses Lightpanda text dump", async () => {
    _setLightpandaRunnerForTest({
      resolveBin: () => "/usr/local/bin/lightpanda",
      run: async (_bin, args) => {
        expect(args).toContain("semantic_tree_text");
        return { code: 0, stdout: "Hello Article\nmain content", stderr: "" };
      },
    });
    const result = await runWebFetch({ url: "https://example.com/post", output: "snapshot" });
    expect(result.ok).toBe(true);
    expect(result.output).toBe("snapshot");
    expect(String(result.text).toLowerCase()).toContain("hello");
  });

  test("missing Lightpanda returns a clear error", async () => {
    _setLightpandaRunnerForTest({
      resolveBin: () => null,
      run: async () => {
        throw new Error("should not spawn");
      },
    });
    const result = await runWebFetch({ url: "https://example.com" });
    expect(result.ok).toBe(false);
    expect(result.engine).toBe("browser");
    expect(String(result.error)).toMatch(/lightpanda/i);
  });

  test("lightpandaReleaseAsset is set for this OS", () => {
    const asset = lightpandaReleaseAsset();
    expect(asset).toBeTruthy();
    expect(String(asset)).toMatch(/^lightpanda-/);
  });

  test("dumps markdown via Lightpanda", async () => {
    _setLightpandaRunnerForTest({
      resolveBin: () => "/usr/local/bin/lightpanda",
      run: async (_bin, args) => {
        expect(args).toContain("fetch");
        expect(args).toContain("--dump");
        expect(args).toContain("markdown");
        expect(args).toContain("https://spa.example/");
        return { code: 0, stdout: "# Hello SPA\n\nRendered.", stderr: "" };
      },
    });
    const result = await runWebFetch({ url: "https://spa.example/", output: "md" });
    expect(result.ok).toBe(true);
    expect(result.engine).toBe("browser");
    expect(String(result.text)).toContain("Hello SPA");
  });

  test("fetches example.com with md output", async () => {
    const result = await runWebFetch({
      url: "https://example.com",
      output: "md",
      max_chars: 4000,
    });
    expect(result.ok).toBe(true);
    expect(result.output).toBe("md");
    expect(String(result.text).toLowerCase()).toContain("example");
  }, 60_000);
});
