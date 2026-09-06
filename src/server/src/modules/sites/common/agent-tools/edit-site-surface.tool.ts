/**
 * Site surface edit tools — edit_ui / edit_styles / edit_backend.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { type EditHunk, OMITTED_EDIT_TOOL_ERROR, applyEdits, editPayloadIsOmitted, normalizeToLf } from "../../../../common/ai/apply-exact-replace.js";
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
  name: "edit_ui" | "edit_styles" | "edit_backend";
  file: SiteSourceFile;
  description: string;
};

export const SITE_EDIT_SURFACES: SiteEditSurface[] = [
  {
    name: "edit_ui",
    file: "app.tsx",
    description: 'Edit the site UI (React App). Call read_site_files first if you have not read app.tsx this turn. mode="replace": edits[{ old_string, new_string, replace_all? }]. mode="full": write complete content. Prefer replace for small changes.',
  },
  {
    name: "edit_styles",
    file: "styles.css",
    description: 'Edit site styles.css. Call read_site_files first if you have not read styles this turn. mode="replace" with edits[] or mode="full" with complete CSS content.',
  },
  {
    name: "edit_backend",
    file: "backend.ts",
    description: 'Edit the site backend handle() API (GET data / POST action). mode="replace" with edits[] or mode="full" with complete content. Call read_site_files first if you have not read the backend this turn.',
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

        if (editPayloadIsOmitted(next, edits)) {
          return JSON.stringify(OMITTED_EDIT_TOOL_ERROR);
        }

        const result = await updateSiteFile(siteId, surface.file, next, "draft");
        const written = readSourceFile(siteId, "draft", surface.file);
        return JSON.stringify({
          ok: true,
          mode,
          message: summary ?? "Draft updated.",
          content: written,
          draftDirty: result.draftDirty,
          depsInstalled: result.depsInstalled,
          next: result.depsInstalled
            ? "Dependencies auto-installed from imports. Finish any related edits, then call check_site at most once. On ok, stop and reply."
            : "Draft updated. Trust this content snapshot for further edits this turn. Finish related edits first, then check_site at most once — do not verify after every edit.",
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
