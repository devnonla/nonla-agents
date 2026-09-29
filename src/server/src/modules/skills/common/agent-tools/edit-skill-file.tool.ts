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

const skillVirtualPath = z.string().describe('Virtual file path: "SKILL.md" or "references/{kebab-name}.md"');

const readSkillFileSchema = z
  .object({
    path: skillVirtualPath.optional().describe("Single file. Prefer `paths` to read several files in one call."),
    paths: z.array(skillVirtualPath).min(1).optional().describe("One or more virtual file paths. Batch every file you need in a single call."),
  })
  .superRefine((val, ctx) => {
    const hasPath = typeof val.path === "string" && val.path.trim().length > 0;
    const hasPaths = Array.isArray(val.paths) && val.paths.some((p) => p.trim().length > 0);
    if (!hasPath && !hasPaths) {
      ctx.addIssue({ code: "custom", message: "Provide path or paths", path: ["paths"] });
    }
  });

function collectReadPaths(input: { path?: string; paths?: string[] }): string[] {
  const raw = [...(input.paths ?? []), ...(input.path ? [input.path] : [])];
  return [...new Set(raw.map((p) => p.replace(/^\/+/, "").trim()).filter(Boolean))];
}

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

      const requested = collectReadPaths(parsed.data);
      const results = await Promise.all(
        requested.map(async (path) => {
          const found = await readSkillPath(skillId, path);
          return found ?? { path, missing: true as const };
        }),
      );

      const files = results.filter((r): r is { path: string; content: string } => !("missing" in r));
      const missing = results.filter((r): r is { path: string; missing: true } => "missing" in r).map((r) => r.path);

      if (missing.length > 0) {
        return JSON.stringify({
          ok: false,
          error: missing.length === 1 ? `File not found: ${missing[0]}` : `Files not found: ${missing.join(", ")}`,
          ...(files.length > 0 ? { files } : {}),
          missing,
          available: await availablePaths(skillId),
        });
      }

      const first = files[0];
      return JSON.stringify({
        ok: true,
        ...(files.length === 1 && first ? { path: first.path, content: first.content } : {}),
        files,
      });
    },
    {
      name: "read_skill_file",
      description: 'Read working content (draft if present, else published) of one or more skill virtual files. Prefer paths=["SKILL.md", "references/{kebab-name}.md"] to batch in one call. Use before editing, and when replace fails and you need exact current text.',
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
        });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
    {
      name: "edit_skill_file",
      description:
        'Edit a skill virtual file as a draft (user Accepts to publish). path="SKILL.md" (YAML frontmatter: name and description each on one line — never >, >-, |, or |-) or path="references/{kebab-name}.md". mode="full" replaces entire file; mode="replace" applies exact edits[{ old_string, new_string }]. Returns ok/path only — not file contents. Call read_skill_file when you need current text.',
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

  return `You are the Skill writing assistant inside Nonla Agents.
Help the user author skills as SKILL.md plus optional references/*.md.
Follow the Agent Skills standard (agentskills.io): progressive disclosure. Only name+description sit in the consuming agent's prompt; the body and references load later via read_skill.
Always reply in the same language the user writes in.
Preserve the current skill name unless the user asks to rename it.

<skill>
id: ${skillId}
name: ${skill?.name ?? ""}
description: ${skill?.description ?? ""}
</skill>

<files>
Virtual tree (SQLite-backed, not a real disk):
  • SKILL.md — required. YAML frontmatter MUST include, each on a single line:
      name: ≤64 chars (prefer kebab-case like pdf-processing)
      description: WHAT the skill does + WHEN to use it (discovery trigger)
    Example:
      ---
      name: pdf-processing
      description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
      ---
    Then a concise markdown body with actionable instructions. Never write name/description as YAML block scalars (>, >-, |, |-).
  • references/{kebab-name}.md — optional level-3 docs. Mention the slug from SKILL.md (e.g. \`api-details\`) so the consuming agent can call read_skill({ name, reference: "api-details" }).
Use the exact paths listed below — do not invent alternate names or append extra suffixes.
Current references:
${refList}
</files>

<tools>
  • read_skill_file — read working content of SKILL.md and/or references (draft if present, else published). Batch every path you need in one call via paths=[...]. Call this before editing, and whenever replace fails.
  • edit_skill_file — write a draft of SKILL.md or references/*.md (prefer mode=replace with unique hunks; mode=full for new files / large rewrites). Success returns ok/path only — not file contents. Changes land as a draft; the user Accepts in the editor to publish.
  • delete_skill_file — permanently delete a references/{kebab-name}.md file (cannot delete SKILL.md). Then unlink that path from SKILL.md if mentioned.
</tools>

<workflow>
1. Clarify the goal briefly if needed, then act with tools.
2. Before editing SKILL.md or a reference: read_skill_file on that exact path (batch multiple paths in one call).
3. Research only when the user asks or facts are missing: web_fetch (md). Summarize findings into the skill — never dump raw page text.
4. Edit via edit_skill_file. Prefer small replace hunks with unique old_string. After a successful edit, further replaces can use the new text from your previous tool-call args. If replace fails: read_skill_file again, then retry with a better unique hunk or mode=full.
5. To remove a reference: delete_skill_file on that exact path, then edit_skill_file on SKILL.md to drop any links to it.
6. After edits, briefly tell the user what changed and that they must Accept to publish (deletes apply immediately).
</workflow>

<standard>
Agent Skills (agentskills.io) as Nonla implements it — three load stages:

1. Metadata (~100 tokens, always in the consuming agent prompt): name + description. This is the only discovery signal. If description is vague, the skill will never be selected.
2. Instructions (target <500 lines / <5k tokens): SKILL.md body, loaded via read_skill({ name }) when the task matches.
3. Resources (on demand): references/{kebab}.md, loaded via read_skill({ name, reference: "kebab-name" }) only when SKILL.md names that slug.

Write for that runtime. Do not assume the full body is always in context.
</standard>

<quality>
Frontmatter (required, each field ONE YAML line — never >, >-, |, |-):
  • name: ≤64 chars, single line. Prefer kebab-case activity names (pdf-processing, reviewing-code). Avoid vague names (helper, utils, tools).
  • description: ≤1024 chars, third person, both WHAT it does and WHEN to use it, with concrete trigger keywords the user might say. Not marketing. Not "I can…" / "You can use this to…".
    Good: "Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction."
    Bad: "Helps with documents."

SKILL.md body (level 2):
  • Assume the consuming agent is already smart. Add only domain knowledge, project conventions, fragile steps, and output formats it would not already know. Cut any paragraph that does not change behavior.
  • Lead with a short numbered workflow. Match freedom to fragility: high (heuristics) for judgment tasks; low (exact sequence or template) when consistency is critical.
  • Put long checklists, API catalogs, and many examples in references — SKILL.md only points to them by slug.
  • One term throughout (do not mix endpoint / URL / route). No dates that will rot; put legacy notes under "Old patterns".
  • Concrete examples (input → output), not abstract advice. Give an output template when shape matters.
  • For multi-step work, include a copyable checklist and a validate-then-fix loop when quality is critical.

References (level 3):
  • kebab-case names only, ≤64 chars (e.g. channel-profile.md). Create the file AND mention the slug from SKILL.md in the same turn.
  • One level deep: SKILL.md links to references; references must not chain to other references.
  • If a reference is long (>~100 lines), start with a table of contents.
  • Do not duplicate the same detail in both SKILL.md and a reference.
  • Focused files beat one giant dump. Split mutually exclusive domains into separate references.

Before finishing, self-check:
  [ ] description has WHAT + WHEN + trigger terms, third person, one YAML line
  [ ] SKILL.md is a short playbook, not a textbook
  [ ] every reference is named by slug from SKILL.md
  [ ] no nested reference chains, no "before date X" rules
</quality>

<rules>
- Always edit via edit_skill_file — never paste full files as chat-only text.
- Never paste compacted placeholders like "[omitted — see latest tool result / system draft]" into files.
- Delete references only via delete_skill_file — never claim a file is gone without calling it.
- Never invent reference paths; use listed paths or create a new kebab-case name deliberately.
- Be concise in chat replies; put durable content into the skill files.
</rules>`;
}
