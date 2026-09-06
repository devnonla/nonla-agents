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
  if (m.includes("ebadf") || m.includes("posix_spawn") || m.includes("bad file descriptor")) {
    return {
      stage: "runtime",
      hint: "Host failed to spawn the site backend process (not a backend.ts bug). Retry check_site once. If it still fails, tell the user to restart the server.",
    };
  }
  if (m.includes("bundle") || m.includes("build") || m.includes("cannot find module") || m.includes("resolve")) {
    return {
      stage: "bundle",
      hint: "Client bundle failed — fix app.tsx / imports (packages auto-install from import specifiers), then check_site once more (max 2 retries). If still failing, stop and explain.",
    };
  }
  if (m.includes("handle(") || m.includes("backend.ts") || m.includes("load()") || m.includes("data.ts") || m.includes("loader")) {
    return {
      stage: "backend",
      hint: "backend.ts handle() threw — fix method branching / nonlaagents / await / return shape, then check_site once more (max 2 retries). If still failing, stop and explain.",
    };
  }
  if (m.includes("timed out")) {
    return {
      stage: "timeout",
      hint: "Timed out — simplify handle() or fix an infinite loop, then check_site once more. If still failing, stop and explain.",
    };
  }
  return {
    stage: "runtime",
    hint: "Fix the failing part, then check_site again (max 2 retries this turn). If still failing, stop and explain to the user.",
  };
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
        const app = await readDraftFile(siteId, "app.tsx");
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
      description:
        "Primary validation: bundle the React app and run backend.ts handle() for GET. Call ONCE after a batch of related edits — not after every edit. On ok:true, stop tools and reply. On failure, fix then retry (max 2). Prefer this over preview_site; do not call both in the same verify step. Live preview iframe already refreshes after writes.",
      schema: z.object({}),
    },
  );
}
