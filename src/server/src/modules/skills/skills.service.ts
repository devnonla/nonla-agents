import { and, eq, ne } from "drizzle-orm";
import { type NewSkill, type NewSkillReference, agentSkillAssignments, getDb, skillReferences, skills } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { BadRequestException, NotFoundException } from "../../common/exceptions/http.exception.js";
import { wsHub } from "../../common/ws/wsHub.js";
import { composeSkillMarkdown, ensureSkillMarkdown, parseSkillFrontmatter } from "./common/frontmatter.js";

const REF_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSkillName(name: string) {
  if (!name) {
    throw new BadRequestException("Skill name is required");
  }
  if (name.length > 64) {
    throw new BadRequestException("Skill name must be at most 64 characters");
  }
  if (/[\r\n]/.test(name)) {
    throw new BadRequestException("Skill name must be a single line");
  }
}

function assertRefName(name: string) {
  if (!REF_NAME_RE.test(name)) {
    throw new BadRequestException("Reference name must be kebab-case (e.g. api-details)");
  }
  if (name.length > 64) {
    throw new BadRequestException("Reference name must be at most 64 characters");
  }
}

function getSkillOrThrow(id: string) {
  const row = getDb().select().from(skills).where(eq(skills.id, id)).get();
  if (!row) throw new NotFoundException("Skill not found");
  return row;
}

export function listSkills(query: RawQuery = {}) {
  return listQuery({ table: skills, searchColumns: ["name", "description"] }, query);
}

export function getSkill(id: string) {
  const row = getDb().select().from(skills).where(eq(skills.id, id)).get();
  if (!row) return null;
  return {
    ...row,
    content: ensureSkillMarkdown(row.content, row.name, row.description),
  };
}

export function getSkillByName(name: string) {
  return getDb().select().from(skills).where(eq(skills.name, name)).get() ?? null;
}

function assertNameAvailable(name: string, excludeId?: string) {
  assertSkillName(name);
  const db = getDb();
  const dup = excludeId
    ? db
        .select()
        .from(skills)
        .where(and(eq(skills.name, name), ne(skills.id, excludeId)))
        .get()
    : db.select().from(skills).where(eq(skills.name, name)).get();
  if (dup) throw new BadRequestException("Skill name already exists");
}

export function createSkill(body: {
  name: string;
  description: string;
  content?: string;
}) {
  const name = (body.name ?? "").trim();
  const description = (body.description ?? "").trim();
  if (!description) throw new BadRequestException("description is required");
  assertNameAvailable(name);

  const content = body.content?.trim() ? ensureSkillMarkdown(body.content, name, description) : composeSkillMarkdown(name, description, `# ${name}\n\n## Instructions\n\nDescribe how the agent should perform this skill.\n\n## Additional resources\n\n- Put detailed docs under \`references/\` and mention them here.\n`);

  const now = new Date();
  const skill: NewSkill = {
    id: crypto.randomUUID(),
    name,
    description,
    content,
    createdAt: now,
    updatedAt: now,
  };
  getDb().insert(skills).values(skill).run();
  wsHub.emit("skills:created", skill);
  return getSkill(skill.id!)!;
}

/** Update skill; when `content` is set, sync name/description from SKILL.md frontmatter. */
export function updateSkill(id: string, body: Partial<{ name: string; description: string; content: string; draftContent: string | null }>) {
  getSkillOrThrow(id);
  const patch: Partial<NewSkill> = { updatedAt: new Date() };

  if (body.content !== undefined) {
    const parsed = parseSkillFrontmatter(body.content);
    const fmName = parsed.frontmatter.name?.trim();
    const fmDesc = parsed.frontmatter.description?.trim();
    if (!fmName) throw new BadRequestException("SKILL.md frontmatter must include name");
    if (!fmDesc) throw new BadRequestException("SKILL.md frontmatter must include description");
    assertNameAvailable(fmName, id);
    patch.name = fmName;
    patch.description = fmDesc;
    patch.content = composeSkillMarkdown(fmName, fmDesc, parsed.body);
    // Publishing content clears pending AI draft (align draft with published).
    patch.draftContent = patch.content;
  } else {
    if (body.name !== undefined) {
      const name = body.name.trim();
      assertNameAvailable(name, id);
      patch.name = name;
    }
    if (body.description !== undefined) {
      const description = body.description.trim();
      if (!description) throw new BadRequestException("description is required");
      patch.description = description;
    }
  }

  if (body.draftContent !== undefined && body.content === undefined) {
    patch.draftContent = body.draftContent;
  }

  if (body.content === undefined && (patch.name !== undefined || patch.description !== undefined)) {
    const current = getSkillOrThrow(id);
    const nextName = patch.name ?? current.name;
    const nextDesc = patch.description ?? current.description;
    const parsed = parseSkillFrontmatter(current.content);
    patch.content = composeSkillMarkdown(nextName, nextDesc, parsed.body);
  }

  getDb().update(skills).set(patch).where(eq(skills.id, id)).run();
  const updated = getSkill(id)!;
  wsHub.emit("skills:updated", updated);
  return updated;
}

export function deleteSkill(id: string) {
  getSkillOrThrow(id);
  const db = getDb();
  const affected = db.select({ agentId: agentSkillAssignments.agentId }).from(agentSkillAssignments).where(eq(agentSkillAssignments.skillId, id)).all();
  db.delete(skills).where(eq(skills.id, id)).run();
  wsHub.emit("skills:deleted", { id });
  for (const { agentId } of affected) {
    wsHub.emit("agents:skills-updated", { agentId, skillId: id });
  }
}

export function listReferences(skillId: string) {
  getSkillOrThrow(skillId);
  return getDb().select().from(skillReferences).where(eq(skillReferences.skillId, skillId)).all();
}

export function getReference(skillId: string, refId: string) {
  return (
    getDb()
      .select()
      .from(skillReferences)
      .where(and(eq(skillReferences.id, refId), eq(skillReferences.skillId, skillId)))
      .get() ?? null
  );
}

export function getReferenceByName(skillId: string, name: string) {
  return (
    getDb()
      .select()
      .from(skillReferences)
      .where(and(eq(skillReferences.skillId, skillId), eq(skillReferences.name, name)))
      .get() ?? null
  );
}

export function createReference(skillId: string, body: { name: string; title: string; content?: string; draftContent?: string | null }) {
  getSkillOrThrow(skillId);
  const name = (body.name ?? "").trim();
  const title = (body.title ?? "").trim() || name;
  assertRefName(name);

  const db = getDb();
  const dup = db
    .select()
    .from(skillReferences)
    .where(and(eq(skillReferences.skillId, skillId), eq(skillReferences.name, name)))
    .get();
  if (dup) throw new BadRequestException("Reference name already exists for this skill");

  const now = new Date();
  const row: NewSkillReference = {
    id: crypto.randomUUID(),
    skillId,
    name,
    title,
    content: body.content ?? `# ${title}\n\n`,
    draftContent: body.draftContent ?? null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(skillReferences).values(row).run();
  wsHub.emit("skills:updated", getSkill(skillId));
  return getReference(skillId, row.id!)!;
}

export function updateReference(skillId: string, refId: string, body: Partial<{ name: string; title: string; content: string; draftContent: string | null }>) {
  const existing = getReference(skillId, refId);
  if (!existing) throw new NotFoundException("Reference not found");

  const patch: Partial<NewSkillReference> = { updatedAt: new Date() };

  if (body.name !== undefined) {
    const name = body.name.trim();
    assertRefName(name);
    const dup = getDb()
      .select()
      .from(skillReferences)
      .where(and(eq(skillReferences.skillId, skillId), eq(skillReferences.name, name), ne(skillReferences.id, refId)))
      .get();
    if (dup) throw new BadRequestException("Reference name already exists for this skill");
    patch.name = name;
  }
  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) throw new BadRequestException("title is required");
    patch.title = title;
  }
  if (body.content !== undefined) {
    patch.content = body.content;
    // Publishing content clears pending AI draft.
    patch.draftContent = body.content;
  }
  if (body.draftContent !== undefined && body.content === undefined) {
    patch.draftContent = body.draftContent;
  }

  getDb().update(skillReferences).set(patch).where(eq(skillReferences.id, refId)).run();
  const updated = getReference(skillId, refId)!;
  wsHub.emit("skills:updated", getSkill(skillId));
  return updated;
}

export function deleteReference(skillId: string, refId: string) {
  const existing = getReference(skillId, refId);
  if (!existing) throw new NotFoundException("Reference not found");
  getDb().delete(skillReferences).where(eq(skillReferences.id, refId)).run();
  wsHub.emit("skills:updated", getSkill(skillId));
}

export function writeSkillPath(skillId: string, path: string, content: string): { path: string; content: string } {
  return writeSkillDraftPath(skillId, path, content);
}

/** Working content for AI chain edits: pending draft, else published content. */
export function getWorkingContent(skillId: string, path: string): string | null {
  const normalized = path.replace(/^\/+/, "").trim();
  if (normalized === "SKILL.md") {
    const row = getDb().select().from(skills).where(eq(skills.id, skillId)).get();
    if (!row) return null;
    const published = ensureSkillMarkdown(row.content, row.name, row.description);
    if (row.draftContent != null && row.draftContent !== "") {
      return ensureSkillMarkdown(row.draftContent, row.name, row.description);
    }
    return published;
  }
  const refMatch = normalized.match(/^references\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/);
  if (!refMatch) return null;
  const row = getReferenceByName(skillId, refMatch[1]);
  if (!row) return null;
  return row.draftContent != null && row.draftContent !== "" ? row.draftContent : row.content;
}

/** Write AI draft only — does not publish to content. */
export function writeSkillDraftPath(skillId: string, path: string, draft: string): { path: string; content: string } {
  const normalized = path.replace(/^\/+/, "").trim();
  if (normalized === "SKILL.md") {
    getSkillOrThrow(skillId);
    const next = normalizeToLf(draft);
    getDb().update(skills).set({ draftContent: next, updatedAt: new Date() }).where(eq(skills.id, skillId)).run();
    const updated = getSkill(skillId)!;
    wsHub.emit("skills:updated", updated);
    return { path: "SKILL.md", content: next };
  }

  const refMatch = normalized.match(/^references\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/);
  if (!refMatch?.[1]) {
    throw new BadRequestException('path must be "SKILL.md" or "references/{name}.md"');
  }
  const refName: string = refMatch[1];
  const next = normalizeToLf(draft);
  const existing = getReferenceByName(skillId, refName);
  if (existing) {
    getDb().update(skillReferences).set({ draftContent: next, updatedAt: new Date() }).where(eq(skillReferences.id, existing.id)).run();
    wsHub.emit("skills:updated", getSkill(skillId));
    return { path: `references/${refName}.md`, content: next };
  }
  createReference(skillId, { name: refName, title: refName, content: "", draftContent: next });
  return { path: `references/${refName}.md`, content: next };
}

/** Read working content (draft ?? published) for the skill assistant. */
export function readSkillPath(skillId: string, path: string): { path: string; content: string } | null {
  const normalized = path.replace(/^\/+/, "").trim();
  const content = getWorkingContent(skillId, normalized);
  if (content == null) return null;
  if (normalized === "SKILL.md") return { path: "SKILL.md", content };
  const refMatch = normalized.match(/^references\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/);
  if (!refMatch) return null;
  return { path: `references/${refMatch[1]}.md`, content };
}

function normalizeToLf(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function listAssignedSkillSummaries(agentId: string): { name: string; description: string }[] {
  const db = getDb();
  return db.select({ name: skills.name, description: skills.description }).from(agentSkillAssignments).innerJoin(skills, eq(agentSkillAssignments.skillId, skills.id)).where(eq(agentSkillAssignments.agentId, agentId)).all();
}

export function getAssignedSkillByName(agentId: string, name: string) {
  const db = getDb();
  return (
    db
      .select({
        id: skills.id,
        name: skills.name,
        description: skills.description,
        content: skills.content,
      })
      .from(agentSkillAssignments)
      .innerJoin(skills, eq(agentSkillAssignments.skillId, skills.id))
      .where(and(eq(agentSkillAssignments.agentId, agentId), eq(skills.name, name)))
      .get() ?? null
  );
}
