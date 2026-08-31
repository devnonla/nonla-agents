import { describe, expect, test } from "bun:test";
import { runFetchUrl } from "../common/ai/agent-tools/fetch-url.tool.js";
import { htmlToLlmText } from "../common/ai/agent-tools/html-to-llm-text.js";

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

describe("htmlToLlmText", () => {
  test("html mode returns simplified HTML without script/style", () => {
    const out = htmlToLlmText(SAMPLE_HTML, "html", "https://example.com/post");
    expect(out.toLowerCase()).toContain("main");
    expect(out.toLowerCase()).toContain("hello");
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out.toLowerCase()).not.toContain("alert(");
  });

  test("md mode returns markdown", () => {
    const out = htmlToLlmText(SAMPLE_HTML, "md", "https://example.com/post");
    expect(out.toLowerCase()).toContain("main");
    expect(out.toLowerCase()).toContain("hello");
    expect(out).not.toContain("<script");
  });
});

describe("runFetchUrl", () => {
  test("rejects non-http schemes", async () => {
    const result = await runFetchUrl({ url: "file:///etc/passwd" });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toMatch(/http/i);
  });

  test("raw mode clips long text", async () => {
    const long = "a".repeat(20_000);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(long, {
        status: 200,
        headers: { "content-type": "text/plain" },
      })) as unknown as typeof fetch;

    try {
      const result = await runFetchUrl({ url: "https://example.com/long.txt", max_chars: 1000 });
      expect(result.ok).toBe(true);
      expect(result.output_mode).toBe("raw");
      expect(String(result.text).length).toBe(1000);
      expect(result.truncated).toBe(true);
      expect(result.length).toBe(20_000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("html mode extracts main content", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(SAMPLE_HTML, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      })) as unknown as typeof fetch;

    try {
      const result = await runFetchUrl({
        url: "https://example.com/post",
        output_mode: "html",
      });
      expect(result.ok).toBe(true);
      expect(result.output_mode).toBe("html");
      expect(String(result.text).toLowerCase()).toContain("main");
      expect(String(result.text)).not.toContain("alert(");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("md mode falls back to raw for JSON", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ hello: "world" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    try {
      const result = await runFetchUrl({
        url: "https://example.com/api",
        output_mode: "md",
      });
      expect(result.ok).toBe(true);
      expect(result.output_mode).toBe("raw");
      expect(String(result.text)).toContain("hello");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("fetches example.com with md mode", async () => {
    const result = await runFetchUrl({
      url: "https://example.com",
      output_mode: "md",
      max_chars: 4000,
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.output_mode).toBe("md");
    expect(String(result.text).toLowerCase()).toContain("example");
  }, 30_000);
});
