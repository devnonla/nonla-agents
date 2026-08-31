import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { previewSite, readDraftFile } from "../../sites.service.js";

const TOOL_TIMEOUT_MS = 20_000;

function summarizeLoaderData(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      out[key] = { count: value.length };
    } else if (value && typeof value === "object") {
      out[key] = { type: "object", keys: Object.keys(value as object).slice(0, 20) };
    } else if (typeof value === "string" && value.length > 120) {
      out[key] = `${value.slice(0, 120)}…`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function classifyError(message: string): { stage: string; hint: string } {
  const m = message.toLowerCase();
  if (m.includes("bundle") || m.includes("build") || m.includes("cannot find module") || m.includes("resolve")) {
    return {
      stage: "bundle",
      hint: "Client bundle failed — fix app.tsx / imports, or update package.json (deps install automatically on write).",
    };
  }
  if (m.includes("handle(") || m.includes("backend.ts") || m.includes("load()") || m.includes("data.ts") || m.includes("loader")) {
    return { stage: "backend", hint: "backend.ts handle() threw — check method branching, nonlaagents calls, await usage, and return shape." };
  }
  if (m.includes("timed out")) {
    return { stage: "timeout", hint: "Timed out — simplify handle() work or fix an infinite loop." };
  }
  return { stage: "runtime", hint: "Fix the error in draft files, then call check_site again." };
}

async function withToolTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`check_site timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Validate draft by bundling + running load(). */
export function makeCheckSiteTool(siteId: string) {
  return tool(
    async () => {
      try {
        const result = await withToolTimeout(previewSite(siteId), TOOL_TIMEOUT_MS);
        const app = readDraftFile(siteId, "app.tsx");
        const hint = !app.includes("loadSiteData") ? 'Prefer loadSiteData() from "./site-api.js" in app.tsx to load server data.' : undefined;
        return JSON.stringify({
          ok: true,
          htmlChars: result.html.length,
          dataSummary: summarizeLoaderData(result.data),
          message: "Draft bundle + backend GET handle() succeeded.",
          ...(hint ? { hint } : {}),
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const { stage, hint } = classifyError(error);
        return JSON.stringify({ ok: false, stage, error, hint });
      }
    },
    {
      name: "check_site",
      description: "Validate the draft site by bundling the React app and running backend.ts handle() for GET. Returns ok or a structured error. Call after edits when you need to verify. The live preview iframe refreshes after writes.",
      schema: z.object({}),
    },
  );
}
