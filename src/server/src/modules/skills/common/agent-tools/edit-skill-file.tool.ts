import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { type EditHunk, OMITTED_EDIT_TOOL_ERROR, applyEdits, editPayloadIsOmitted, normalizeToLf } from "../../../../common/ai/apply-exact-replace.js";
import { deleteReference, getReferenceByName, getSkill, getWorkingContent, listReferences, readSkillPath, writeSkillDraftPath } from "../../skills.service.js";

const editHunkSchema = z.object({
  old_string: z.string().min(1),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
});

const editSkillFileSchema = z
  .object({
    path: z.string().describe('Virtual file path: "SKILL.md" or "references/{name}.md"'),
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

const readSkillFileSchema = z.object({
  path: z.string().describe('Virtual file path: "SKILL.md" or "references/{kebab-name}.md"'),
});

const deleteSkillFileSchema = z.object({
  path: z.string().describe('Reference path only: "references/{kebab-name}.md". Cannot delete SKILL.md.'),
});

async function availablePaths(skillId: string): Promise<string[]> {
  return ["SKILL.md", ...(await listReferences(skillId)).map((r) => `references/${r.name}.md`)];
}

export function makeReadSkillFileTool(skillId: string) {
  return tool(
    async (input) => {
      const parsed = readSkillFileSchema.safeParse(input);
      if (!parsed.success) {
        return JSON.stringify({
          ok: false,
          error: parsed.error.issues.map((i) => i.message).join("; "),
          available: await availablePaths(skillId),
        });
      }

      const path = parsed.data.path.replace(/^\/+/, "").trim();
      const found = await readSkillPath(skillId, path);
      if (!found) {
        return JSON.stringify({
          ok: false,
          error: `File not found: ${path}`,
          available: await availablePaths(skillId),
        });
      }

      return JSON.stringify({
        ok: true,
        path: found.path,
        content: found.content,
      });
    },
    {
      name: "read_skill_file",
      description: 'Read working content (draft if present, else published) of a skill virtual file. path="SKILL.md" or path="references/{kebab-name}.md". Use before editing a reference or when replace fails and you need exact current text.',
      schema: readSkillFileSchema,
    },
  );
}

export function makeEditSkillFileTool(skillId: string) {
  return tool(
    async (input) => {
      const parsed = editSkillFileSchema.safeParse(input);
      if (!parsed.success) {
        return JSON.stringify({
          ok: false,
          error: parsed.error.issues.map((i) => i.message).join("; "),
        });
      }

      const { path, mode, content, edits, summary } = parsed.data;
      try {
        let next: string;
        if (mode === "full") {
          next = normalizeToLf(content!);
        } else {
          const current = (await getWorkingContent(skillId, path)) ?? "";
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

        const written = await writeSkillDraftPath(skillId, path, next);
        return JSON.stringify({
          ok: true,
          path: written.path,
          mode,
          message: summary ?? "Draft updated. User must Accept in the editor to publish.",
          content: written.content,
        });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
    {
      name: "edit_skill_file",
      description: 'Edit a skill virtual file as a draft (user Accepts to publish). path="SKILL.md" (must keep YAML frontmatter with name + description) or path="references/{kebab-name}.md". mode="full" replaces entire file; mode="replace" applies exact edits[{ old_string, new_string }].',
      schema: editSkillFileSchema,
    },
  );
}

export function makeDeleteSkillFileTool(skillId: string) {
  return tool(
    async (input) => {
      const parsed = deleteSkillFileSchema.safeParse(input);
      if (!parsed.success) {
        return JSON.stringify({
          ok: false,
          error: parsed.error.issues.map((i) => i.message).join("; "),
          available: await availablePaths(skillId),
        });
      }

      const path = parsed.data.path.replace(/^\/+/, "").trim();
      if (path === "SKILL.md") {
        return JSON.stringify({
          ok: false,
          error: "Cannot delete SKILL.md",
          available: await availablePaths(skillId),
        });
      }

      const refMatch = path.match(/^references\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/);
      if (!refMatch?.[1]) {
        return JSON.stringify({
          ok: false,
          error: 'path must be "references/{kebab-name}.md"',
          available: await availablePaths(skillId),
        });
      }

      const existing = await getReferenceByName(skillId, refMatch[1]);
      if (!existing) {
        return JSON.stringify({
          ok: false,
          error: `File not found: ${path}`,
          available: await availablePaths(skillId),
        });
      }

      try {
        await deleteReference(skillId, existing.id);
        return JSON.stringify({
          ok: true,
          path,
          deleted: true,
          message: "Reference deleted permanently. Remove any links to this path from SKILL.md via edit_skill_file if needed.",
          available: await availablePaths(skillId),
        });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
    {
      name: "delete_skill_file",
      description: "Permanently delete a references/{kebab-name}.md file. Cannot delete SKILL.md. After deleting, remove links to that path from SKILL.md via edit_skill_file when present.",
      schema: deleteSkillFileSchema,
    },
  );
}

export async function buildSkillAgentSystemPrompt(skillId: string): Promise<string> {
  const skill = await getSkill(skillId);
  const refs = await listReferences(skillId);
  const refList = refs.length === 0 ? "(none yet)" : refs.map((r) => `- references/${r.name}.md — ${r.title}`).join("\n");

  const workingSkillMd = (await getWorkingContent(skillId, "SKILL.md")) ?? skill?.content ?? "";

  return `You are the Skill writing assistant inside Nonla Agents.
Help the user author skills as SKILL.md plus optional references/*.md.
Always reply in the same language the user writes in.

<skill>
id: ${skillId}
name: ${skill?.name ?? ""}
description: ${skill?.description ?? ""}
</skill>

<files>
Virtual tree (SQLite-backed, not a real disk):
  • SKILL.md — required. YAML frontmatter MUST include:
      name: human-readable skill name
      description: when an agent should use this skill (discovery trigger; keep concrete and searchable)
    Then a concise markdown body with actionable instructions.
  • references/{kebab-name}.md — optional progressive-disclosure docs. Link them from SKILL.md by exact path.
Use the exact paths listed below — do not invent alternate names or append extra suffixes.
Current references:
${refList}
</files>

<current_skill_md>
${workingSkillMd}
</current_skill_md>

<tools>
  • read_skill_file — read working content of SKILL.md or a reference (draft if present, else published). Call this before editing any reference, and whenever replace fails.
  • edit_skill_file — write a draft of SKILL.md or references/*.md (prefer mode=replace with unique hunks; mode=full for new files / large rewrites). Changes land as a draft; the user Accepts in the editor to publish.
  • delete_skill_file — permanently delete a references/{kebab-name}.md file (cannot delete SKILL.md). Then unlink that path from SKILL.md if mentioned.
  • web_fetch — GET JS-rendered page content (output=md by default; html or snapshot if needed).
  • run_js — scratch JavaScript for calculation, parsing, or transforming data (not saved).
</tools>

<workflow>
1. Clarify the goal briefly if needed, then act with tools.
2. Before editing a reference: read_skill_file on that exact path.
3. Research only when the user asks or facts are missing: web_fetch (md). Summarize findings into the skill — never dump raw page text.
4. Edit via edit_skill_file. Prefer small replace hunks with unique old_string. If replace fails: read_skill_file again, then retry with a better unique hunk or mode=full.
5. To remove a reference: delete_skill_file on that exact path, then edit_skill_file on SKILL.md to drop any links to it.
6. After edits, briefly tell the user what changed and that they must Accept to publish (deletes apply immediately).
</workflow>

<quality>
- description frontmatter: specific "when to use" triggers, not vague marketing.
- SKILL.md body: short, actionable steps; no long checklists/examples (those go in references).
- References: kebab-case names only (e.g. channel-profile.md). Create the file and link it from SKILL.md in the same turn.
- Do not duplicate the same detail in both SKILL.md and a reference.
- Preserve valid YAML frontmatter (name + description required).
</quality>

<rules>
- Always edit via edit_skill_file — never paste full files as chat-only text.
- Never paste compacted placeholders like "[omitted — see latest tool result / system draft]" into files.
- Delete references only via delete_skill_file — never claim a file is gone without calling it.
- Never invent reference paths; use listed paths or create a new kebab-case name deliberately.
- Be concise in chat replies; put durable content into the skill files.
</rules>`;
}
