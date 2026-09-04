/**
 * edit_code — coding assistant tool (replace | full).
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { type EditHunk, applyEdits, normalizeToLf } from "../../../../common/ai/apply-exact-replace.js";
import { getDraftCode, updateDraftCode } from "../../tools.service.js";

const editHunkSchema = z.object({
  old_string: z.string().min(1),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
});

const editCodeSchema = z
  .object({
    mode: z.enum(["replace", "full"]),
    code: z.string().optional(),
    edits: z.array(editHunkSchema).optional(),
    summary: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "full") {
      if (typeof val.code !== "string") {
        ctx.addIssue({ code: "custom", message: "mode=full requires code", path: ["code"] });
      }
    } else if (!val.edits || val.edits.length === 0) {
      ctx.addIssue({ code: "custom", message: "mode=replace requires a non-empty edits array", path: ["edits"] });
    }
  });

export function makeEditCodeTool(toolId: string) {
  return tool(
    async (input) => {
      const parsed = editCodeSchema.safeParse(input);
      if (!parsed.success) {
        return JSON.stringify({
          ok: false,
          error: parsed.error.issues.map((i) => i.message).join("; "),
          hint: 'Use mode="full" with code, or mode="replace" with edits[{ old_string, new_string }].',
        });
      }

      const { mode, code, edits, summary } = parsed.data;
      try {
        let next: string;
        if (mode === "full") {
          next = normalizeToLf(code!);
        } else {
          const current = (await getDraftCode(toolId)) ?? "";
          if (!current.trim()) {
            return JSON.stringify({
              ok: false,
              error: "draft is empty — cannot replace",
              hint: 'Use mode="full" to write the complete TypeScript module first.',
            });
          }
          const applied = applyEdits(current, edits as EditHunk[]);
          if (!applied.ok) {
            return JSON.stringify({ ok: false, error: applied.error, hint: applied.hint });
          }
          next = applied.content;
        }

        await updateDraftCode(toolId, next);
        return JSON.stringify({
          ok: true,
          mode,
          message: summary ?? "Draft updated.",
          current_code: next,
          next: "MANDATORY NEXT STEP: Call run_current_script IMMEDIATELY to test the draft code.",
        });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
    {
      name: "edit_code",
      description:
        'Edit the TypeScript module in the editor. mode="replace": apply exact edits[{ old_string, new_string, replace_all? }] (multi-hunk). mode="full": replace the entire file with code. Complete module with // @name / // @description / // @param headers and export default async function main(input) — NO markdown fences. Always call this tool to apply code; NEVER paste code as chat text.',
      schema: editCodeSchema,
    },
  );
}
