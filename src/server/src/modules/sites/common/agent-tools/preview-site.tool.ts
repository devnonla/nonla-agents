import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { previewSite } from "../../sites.service.js";
import { collectSiteEditorDiagnostics } from "../site-editor-diagnostics.js";

const TOOL_TIMEOUT_MS = 15_000;

function summarizeLoaderData(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      out[key] = {
        count: value.length,
        sample: value.slice(0, 1),
      };
    } else if (typeof value === "string" && value.length > 200) {
      out[key] = `${value.slice(0, 200)}…`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function withToolTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`preview_site timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function makePreviewSiteTool(siteId: string) {
  return tool(
    async () => {
      const editorErrors = collectSiteEditorDiagnostics(siteId);
      try {
        const result = await withToolTimeout(previewSite(siteId), TOOL_TIMEOUT_MS);
        const htmlPreview = result.html.length > 2000 ? `${result.html.slice(0, 2000)}\n…[truncated]` : result.html;
        return JSON.stringify({
          ok: editorErrors.length === 0,
          htmlChars: result.html.length,
          htmlPreview,
          dataSummary: summarizeLoaderData(result.data),
          editorErrors,
          ...(editorErrors.length > 0
            ? {
                hint: "Fix editorErrors with edit_ui / edit_backend / edit_deps / edit_styles before other work.",
              }
            : {}),
        });
      } catch (err) {
        return JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          editorErrors,
          ...(editorErrors.length > 0
            ? {
                hint: "Fix editorErrors with edit_ui / edit_backend / edit_deps / edit_styles before other work.",
              }
            : {}),
        });
      }
    },
    {
      name: "preview_site",
      description: "SSR-render the draft site and return a short HTML preview + data summary, plus editorErrors (TypeScript/JSON diagnostics). Fix editorErrors before other work. Use once after related edits.",
      schema: z.object({}),
    },
  );
}
