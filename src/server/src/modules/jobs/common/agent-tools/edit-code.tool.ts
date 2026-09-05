/**
 * edit_code — job coding assistant tool (replace | full).
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { type EditHunk, OMITTED_EDIT_TOOL_ERROR, applyEdits, editPayloadIsOmitted, normalizeToLf } from "../../../../common/ai/apply-exact-replace.js";
import { getDraftCode, updateDraftCode } from "../../jobs.service.js";

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

export function makeJobEditCodeTool(jobId: string) {
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
          const current = (await getDraftCode(jobId)) ?? "";
          if (!current.trim()) {
            return JSON.stringify({
              ok: false,
              error: "draft is empty — cannot replace",
              hint: 'Use mode="full" to write the complete TypeScript job file first.',
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

        await updateDraftCode(jobId, next);
        return JSON.stringify({
          ok: true,
          mode,
          message: summary ?? "Draft updated.",
          current_code: next,
          next: "REQUIRED NEXT TOOL CALL: run_current_job (now). Do not reply with text first. run_current_job returns instantly — then give a short summary.",
        });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
    {
      name: "edit_code",
      description: 'Edit the TypeScript job file in the editor. mode="replace": apply exact edits[{ old_string, new_string, replace_all? }]. mode="full": replace the entire file with code. Raw TS only — NO markdown fences. Always call this tool to apply code; NEVER paste code as chat text.',
      schema: editCodeSchema,
    },
  );
}
