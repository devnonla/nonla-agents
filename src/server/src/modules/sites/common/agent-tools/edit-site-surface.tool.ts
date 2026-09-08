/**
 * Site draft edit tool — one function for app.tsx / styles.css / backend.ts.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { type EditHunk, OMITTED_EDIT_TOOL_ERROR, applyEdits, editPayloadIsOmitted, normalizeToLf } from "../../../../common/ai/apply-exact-replace.js";
import { type SiteSourceFile, readSourceFile } from "../../sites-fs.js";
import { updateSiteFile } from "../../sites.service.js";

export const SITE_EDITABLE_FILES = ["app.tsx", "styles.css", "backend.ts"] as const;
export type SiteEditableFile = (typeof SITE_EDITABLE_FILES)[number];

const editHunkSchema = z.object({
  old_string: z.string().min(1),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
});

const editSiteSchema = z
  .object({
    file: z.enum(SITE_EDITABLE_FILES),
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

export function makeEditSiteFilesTool(siteId: string) {
  return tool(
    async (input) => {
      const parsed = editSiteSchema.safeParse(input);
      if (!parsed.success) {
        return JSON.stringify({
          ok: false,
          error: parsed.error.issues.map((i) => i.message).join("; "),
          hint: 'Use file="app.tsx"|"styles.css"|"backend.ts", then mode="full" with content, or mode="replace" with edits[{ old_string, new_string }].',
        });
      }

      const { file, mode, content, edits, summary } = parsed.data;
      try {
        let next: string;
        if (mode === "full") {
          next = normalizeToLf(content!);
        } else {
          const current = readSourceFile(siteId, "draft", file as SiteSourceFile);
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

        const result = await updateSiteFile(siteId, file, next, "draft");
        const written = readSourceFile(siteId, "draft", file as SiteSourceFile);
        return JSON.stringify({
          ok: true,
          file,
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
      name: "edit_site_files",
      description:
        'Edit a site draft file. file: "app.tsx" (UI), "styles.css", or "backend.ts". Draft is in the system prompt / latest snapshot for that file — do not re-read unless replace failed. mode="replace": edits[{ old_string, new_string, replace_all? }]. mode="full": write complete content. Prefer replace for small changes.',
      schema: editSiteSchema,
    },
  );
}
