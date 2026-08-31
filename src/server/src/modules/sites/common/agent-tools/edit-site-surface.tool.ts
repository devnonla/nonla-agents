/**
 * Site surface edit tools — edit_ui / edit_styles / edit_backend / edit_deps.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { type EditHunk, applyEdits, normalizeToLf } from "../../../../common/ai/apply-exact-replace.js";
import { type SiteSourceFile, readSourceFile } from "../../sites-fs.js";
import { updateSiteFile } from "../../sites.service.js";

const editHunkSchema = z.object({
  old_string: z.string().min(1),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
});

const editSiteSchema = z
  .object({
    mode: z.enum(["replace", "full"]),
    content: z.string().optional(),
    edits: z.array(editHunkSchema).optional(),
    summary: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "full") {
      if (typeof val.content !== "string") {
        ctx.addIssue({ code: "custom", message: "mode=full requires content", path: ["content"] });
      }
    } else if (!val.edits || val.edits.length === 0) {
      ctx.addIssue({ code: "custom", message: "mode=replace requires a non-empty edits array", path: ["edits"] });
    }
  });

export type SiteEditSurface = {
  name: "edit_ui" | "edit_styles" | "edit_backend" | "edit_deps";
  file: SiteSourceFile;
  description: string;
};

export const SITE_EDIT_SURFACES: SiteEditSurface[] = [
  {
    name: "edit_ui",
    file: "app.tsx",
    description: 'Edit the site UI (React App). mode="replace": edits[{ old_string, new_string, replace_all? }]. mode="full": write complete content. Prefer replace for small changes.',
  },
  {
    name: "edit_styles",
    file: "styles.css",
    description: 'Edit site styles. mode="replace" with edits[] or mode="full" with complete CSS content.',
  },
  {
    name: "edit_backend",
    file: "backend.ts",
    description: 'Edit the site backend handle() API (GET data / POST action). mode="replace" with edits[] or mode="full" with complete content. Call read_site_files first if you have not read the backend this turn.',
  },
  {
    name: "edit_deps",
    file: "package.json",
    description: 'Edit site package.json dependencies (auto bun install). mode="replace" with edits[] or mode="full" with complete JSON.',
  },
];

export function makeEditSiteSurfaceTool(siteId: string, surface: SiteEditSurface) {
  return tool(
    async (input) => {
      const parsed = editSiteSchema.safeParse(input);
      if (!parsed.success) {
        return JSON.stringify({
          ok: false,
          error: parsed.error.issues.map((i) => i.message).join("; "),
          hint: 'Use mode="full" with content, or mode="replace" with edits[{ old_string, new_string }].',
        });
      }

      const { mode, content, edits, summary } = parsed.data;
      try {
        let next: string;
        if (mode === "full") {
          next = normalizeToLf(content!);
        } else {
          const current = readSourceFile(siteId, "draft", surface.file);
          if (!current.trim()) {
            return JSON.stringify({
              ok: false,
              error: "file is empty — cannot replace",
              hint: 'Use mode="full" to write the complete file first.',
            });
          }
          const applied = applyEdits(current, edits as EditHunk[]);
          if (!applied.ok) {
            return JSON.stringify({ ok: false, error: applied.error, hint: applied.hint });
          }
          next = applied.content;
        }

        const result = await updateSiteFile(siteId, surface.file, next, "draft");
        return JSON.stringify({
          ok: true,
          mode,
          message: summary ?? "Draft updated.",
          content: next,
          draftDirty: result.draftDirty,
          depsInstalled: result.depsInstalled,
          next: result.depsInstalled ? "Dependencies installed. Continue related edits, then check_site if you need to verify." : "Draft updated. Trust this content snapshot for further edits in this turn. Call check_site after related edits if you need to verify.",
        });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
    {
      name: surface.name,
      description: surface.description,
      schema: editSiteSchema,
    },
  );
}

export function makeAllSiteEditTools(siteId: string) {
  return SITE_EDIT_SURFACES.map((surface) => makeEditSiteSurfaceTool(siteId, surface));
}
