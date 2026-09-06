import { existsSync } from "node:fs";
import { chmod, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readCapturedOutput, spawnCaptured, unlinkCaptured } from "../../sandbox/index.js";
import { getDataDir } from "../../utils/data-dir.js";

const DEFAULT_MAX_CHARS = 8_000;
const HARD_MAX_CHARS = 16_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const HARD_MAX_TIMEOUT_MS = 60_000;

export type WebFetchOutput = "md" | "html" | "snapshot";
export type WebFetchEngine = "browser";

const outputEnum = z.enum(["md", "html", "snapshot"]);

const NIGHTLY_RELEASE = "https://github.com/lightpanda-io/browser/releases/download/nightly";

export type WebFetchResult = Record<string, unknown>;

export type LightpandaRunResult = { code: number; stdout: string; stderr: string };

export type LightpandaRunner = {
  resolveBin: () => string | null | Promise<string | null>;
  run: (bin: string, args: string[], timeoutMs: number) => Promise<LightpandaRunResult>;
};

/** Nightly asset name for this OS/arch, or null if unsupported. */
export function lightpandaReleaseAsset(): string | null {
  const { platform, arch } = process;
  if (platform === "darwin" && arch === "arm64") return "lightpanda-aarch64-macos";
  if (platform === "darwin" && arch === "x64") return "lightpanda-x86_64-macos";
  if (platform === "linux" && arch === "arm64") return "lightpanda-aarch64-linux";
  if (platform === "linux" && arch === "x64") return "lightpanda-x86_64-linux";
  return null;
}

function cachedLightpandaPath(): string {
  return join(getDataDir(), "bin", "lightpanda");
}

function existingLightpandaBin(): string | null {
  const which = Bun.which("lightpanda");
  if (which) return which;
  const cached = cachedLightpandaPath();
  return existsSync(cached) ? cached : null;
}

let lightpandaDownload: Promise<string | null> | null = null;

async function downloadLightpanda(): Promise<string | null> {
  const asset = lightpandaReleaseAsset();
  if (!asset) return null;
  const dest = cachedLightpandaPath();
  await mkdir(join(getDataDir(), "bin"), { recursive: true });
  const tmp = `${dest}.download`;
  const res = await fetch(`${NIGHTLY_RELEASE}/${asset}`, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Lightpanda download failed (${res.status})`);
  }
  await Bun.write(tmp, res);
  await chmod(tmp, 0o755);
  await rename(tmp, dest);
  return dest;
}

async function ensureLightpandaBin(): Promise<string | null> {
  const env = process.env.LIGHTPANDA_BIN?.trim();
  if (env) {
    if (existsSync(env)) return env;
    throw new Error(`LIGHTPANDA_BIN does not exist: ${env}`);
  }
  const hit = existingLightpandaBin();
  if (hit) return hit;
  if (!lightpandaDownload) {
    lightpandaDownload = downloadLightpanda().finally(() => {
      lightpandaDownload = null;
    });
  }
  return lightpandaDownload;
}

export const defaultLightpandaRunner: LightpandaRunner = {
  resolveBin: () => ensureLightpandaBin(),
  async run(bin, args, timeoutMs) {
    const captured = await spawnCaptured([bin, ...args], {
      env: { ...process.env, LIGHTPANDA_DISABLE_TELEMETRY: "true" },
    });
    const killer = setTimeout(() => captured.kill(), timeoutMs);
    try {
      const code = (await captured.exited) ?? 1;
      const { stdout, stderr } = await readCapturedOutput(captured);
      return { code, stdout, stderr };
    } finally {
      clearTimeout(killer);
      await unlinkCaptured(captured);
    }
  },
};

let lightpandaRunner: LightpandaRunner = defaultLightpandaRunner;

/** Test-only: swap Lightpanda spawn. Pass null to restore default. */
export function _setLightpandaRunnerForTest(runner: LightpandaRunner | null) {
  lightpandaRunner = runner ?? defaultLightpandaRunner;
}

function clipText(text: string, maxChars: number): { text: string; truncated?: true; length?: number } {
  if (text.length <= maxChars) return { text };
  const body = text.slice(0, maxChars);
  return {
    text: `${body}\n\n[truncated: showing ${maxChars} of ${text.length} chars]`,
    truncated: true,
    length: text.length,
  };
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

function dumpFlag(output: WebFetchOutput): string {
  if (output === "md") return "markdown";
  if (output === "html") return "html";
  return "semantic_tree_text";
}

async function fetchLightpanda(url: URL, output: WebFetchOutput, timeoutMs: number, maxChars: number): Promise<WebFetchResult> {
  let bin: string | null;
  try {
    bin = (await lightpandaRunner.resolveBin()) ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, url: url.toString(), output, engine: "browser" satisfies WebFetchEngine, error: msg };
  }
  if (!bin) {
    const asset = lightpandaReleaseAsset();
    const error = asset ? `Lightpanda is not available. Set LIGHTPANDA_BIN or install the nightly binary (${asset}).` : "Lightpanda is not supported on this platform.";
    return { ok: false, url: url.toString(), output, engine: "browser" satisfies WebFetchEngine, error };
  }

  const args = ["fetch", "--dump", dumpFlag(output), "--wait-until", "load", "--wait-ms", String(timeoutMs), "--terminate-ms", String(timeoutMs), url.toString()];

  try {
    const ran = await lightpandaRunner.run(bin, args, timeoutMs + 5_000);
    if (ran.code !== 0) {
      const detail = (ran.stderr || ran.stdout).trim() || `exit ${ran.code}`;
      return {
        ok: false,
        url: url.toString(),
        output,
        engine: "browser" satisfies WebFetchEngine,
        error: `Lightpanda failed: ${detail.slice(0, 500)}`,
      };
    }

    const clipped = clipText(ran.stdout, maxChars);
    return {
      ok: true,
      url: url.toString(),
      output,
      engine: "browser" satisfies WebFetchEngine,
      text: clipped.text,
      ...(clipped.truncated ? { truncated: true as const, length: clipped.length } : {}),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, url: url.toString(), output, engine: "browser" satisfies WebFetchEngine, error: msg };
  }
}

export async function runWebFetch(input: {
  url: string;
  output?: WebFetchOutput;
  timeout_ms?: number;
  max_chars?: number;
}): Promise<WebFetchResult> {
  const parsed = isHttpUrl(input.url.trim());
  if (!parsed) {
    return { ok: false, error: "Only http:// and https:// URLs are allowed" };
  }

  const timeoutMs = Math.min(HARD_MAX_TIMEOUT_MS, Math.max(1_000, input.timeout_ms ?? DEFAULT_TIMEOUT_MS));
  const maxChars = Math.min(HARD_MAX_CHARS, Math.max(500, input.max_chars ?? DEFAULT_MAX_CHARS));
  const output: WebFetchOutput = input.output ?? "md";

  return fetchLightpanda(parsed, output, timeoutMs, maxChars);
}

const DESCRIPTION = `Fetch a URL and return JS-rendered page content (Lightpanda). GET only.

output:
- md (default) — main content as Markdown (best for reading articles/docs)
- html — full serialized DOM after JS (includes script, style, markup)
- snapshot — visible page text / accessibility tree (no tags)

Always executes page JavaScript (SPA-safe). Response text is capped (default 8k, max 16k chars). When clipped, text ends with [truncated: showing N of M chars] and the payload includes truncated=true and length=M.`;

export const webFetchTool = tool(async (input) => JSON.stringify(await runWebFetch(input)), {
  name: "web_fetch",
  description: DESCRIPTION,
  schema: z.object({
    url: z.string().describe("http(s) URL to fetch"),
    output: outputEnum.optional().describe("md = Markdown (default, for reading); html = full DOM after JS incl. script/style; snapshot = visible page text"),
    timeout_ms: z.number().optional().describe("Timeout in ms (default 30000, max 60000)"),
    max_chars: z.number().optional().describe("Max characters of text to return (default 8000, max 16000)"),
  }),
});

export const TOOL_DEF = {
  toolName: "web_fetch",
  toolLabel: "Web Fetch",
  description: "Fetch a URL with JS rendering (Lightpanda). output: md (default Markdown), html, snapshot.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "http(s) URL to fetch" },
      output: {
        type: "string",
        enum: ["md", "html", "snapshot"],
        description: "md = Markdown (default, for reading); html = full DOM after JS incl. script/style; snapshot = visible page text",
      },
      timeout_ms: { type: "number", description: "Timeout in ms (default 30000, max 60000)" },
      max_chars: { type: "number", description: "Max characters of text to return (default 8000, max 16000)" },
    },
    required: ["url"],
  },
};
