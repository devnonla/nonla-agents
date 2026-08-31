import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { htmlToLlmText } from "./html-to-llm-text.js";

const DEFAULT_MAX_CHARS = 8_000;
const HARD_MAX_CHARS = 16_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const HARD_MAX_TIMEOUT_MS = 60_000;

const outputModeEnum = z.enum(["raw", "html", "md"]);

function clipText(text: string, maxChars: number): { text: string; truncated?: true; length?: number } {
  if (text.length <= maxChars) return { text };
  return { text: text.slice(0, maxChars), truncated: true, length: text.length };
}

function isHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

function looksLikeHtml(contentType: string | null, text: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("text/html") || ct.includes("application/xhtml")) return true;
  const head = text.slice(0, 512).toLowerCase();
  return /<!doctype\s+html|<html[\s>]/.test(head);
}

function isProbablyBinary(contentType: string | null): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (!ct) return false;
  if (ct.startsWith("text/")) return false;
  if (ct.includes("json") || ct.includes("xml") || ct.includes("javascript") || ct.includes("urlencoded")) return false;
  if (ct.startsWith("image/") || ct.startsWith("audio/") || ct.startsWith("video/") || ct.startsWith("application/octet")) {
    return true;
  }
  return false;
}

export async function runFetchUrl(input: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout_ms?: number;
  max_chars?: number;
  output_mode?: "raw" | "html" | "md";
}): Promise<Record<string, unknown>> {
  const parsed = isHttpUrl(input.url.trim());
  if (!parsed) {
    return { ok: false, error: "Only http:// and https:// URLs are allowed" };
  }

  const method = (input.method ?? "GET").toUpperCase();
  const timeoutMs = Math.min(HARD_MAX_TIMEOUT_MS, Math.max(1_000, input.timeout_ms ?? DEFAULT_TIMEOUT_MS));
  const maxChars = Math.min(HARD_MAX_CHARS, Math.max(500, input.max_chars ?? DEFAULT_MAX_CHARS));
  const requestedMode = input.output_mode ?? "raw";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(parsed.toString(), {
      method,
      headers: input.headers,
      body: input.body !== undefined && method !== "GET" && method !== "HEAD" ? input.body : undefined,
      signal: controller.signal,
      redirect: "follow",
    });

    const contentType = res.headers.get("content-type");
    if (isProbablyBinary(contentType)) {
      return {
        ok: false,
        status: res.status,
        content_type: contentType ?? undefined,
        error: "Binary response is not supported; fetch text/HTML/JSON instead",
      };
    }

    const rawText = await res.text();
    let mode: "raw" | "html" | "md" = requestedMode;
    let text = rawText;

    if ((requestedMode === "html" || requestedMode === "md") && looksLikeHtml(contentType, rawText)) {
      text = htmlToLlmText(rawText, requestedMode, parsed.toString());
    } else if (requestedMode === "html" || requestedMode === "md") {
      mode = "raw";
    }

    const clipped = clipText(text, maxChars);
    return {
      ok: res.ok,
      status: res.status,
      content_type: contentType ?? undefined,
      output_mode: mode,
      text: clipped.text,
      ...(clipped.truncated ? { truncated: true as const, length: clipped.length } : {}),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = (err instanceof Error && err.name === "AbortError") || /abort/i.test(msg);
    return {
      ok: false,
      error: timedOut ? `Request timed out after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const fetchUrlTool = tool(async (input) => JSON.stringify(await runFetchUrl(input)), {
  name: "fetch_url",
  description: `HTTP fetch a URL (Bun fetch — not a browser). Prefer this over browser unless the page is a SPA that needs interaction or a post-render snapshot.

output_mode:
- md — extract main content via Readability, return Markdown (use when reading page/docs info)
- html — same extract, return simplified main HTML (filtered)
- raw (schema default) — response body as-is: full HTML including script, style, and unfiltered markup

Prefer md for page info; html for main filtered HTML; raw when you need the full unfiltered HTML source. Response text is capped (default 8k, max 16k chars).`,
  schema: z.object({
    url: z.string().describe("http(s) URL to fetch"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]).optional().describe("HTTP method (default GET)"),
    headers: z.record(z.string(), z.string()).optional().describe("Optional request headers"),
    body: z.string().optional().describe("Optional request body for POST/PUT/PATCH"),
    timeout_ms: z.number().optional().describe("Timeout in ms (default 30000, max 60000)"),
    max_chars: z.number().optional().describe("Max characters of text to return (default 8000, max 16000)"),
    output_mode: outputModeEnum.optional().describe("md = main content Markdown (prefer for page info); html = main filtered HTML; raw = full HTML as-is incl. script/style"),
  }),
});

export const TOOL_DEF = {
  toolName: "fetch_url",
  toolLabel: "Fetch URL",
  description: "HTTP fetch a URL. Prefer over browser for page reads. output_mode: md (main content Markdown — use when reading page info), html (main filtered HTML), raw (full HTML as-is incl. script/style).",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "http(s) URL to fetch" },
      method: {
        type: "string",
        enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
        description: "HTTP method (default GET)",
      },
      headers: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Optional request headers",
      },
      body: { type: "string", description: "Optional request body for POST/PUT/PATCH" },
      timeout_ms: { type: "number", description: "Timeout in ms (default 30000, max 60000)" },
      max_chars: { type: "number", description: "Max characters of text to return (default 8000, max 16000)" },
      output_mode: {
        type: "string",
        enum: ["raw", "html", "md"],
        description: "md = main content Markdown (prefer for page info); html = main filtered HTML; raw = full HTML as-is incl. script/style",
      },
    },
    required: ["url"],
  },
};
