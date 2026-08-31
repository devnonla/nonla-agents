const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/;

export type SkillFrontmatter = {
  name: string;
  description: string;
};

export function parseSkillFrontmatter(content: string): {
  frontmatter: Partial<SkillFrontmatter>;
  body: string;
  hasFrontmatter: boolean;
} {
  const trimmed = content.replace(/^\uFEFF/, "");
  const m = trimmed.match(FRONTMATTER_RE);
  if (!m) {
    return { frontmatter: {}, body: trimmed, hasFrontmatter: false };
  }

  const yaml = m[1] ?? "";
  const body = m[2] ?? "";
  const frontmatter: Partial<SkillFrontmatter> = {};

  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "name") frontmatter.name = value;
    if (key === "description") frontmatter.description = value;
  }

  return { frontmatter, body, hasFrontmatter: true };
}

export function composeSkillMarkdown(name: string, description: string, body: string): string {
  const safeDesc = description.replace(/\r?\n/g, " ").trim();
  const normalizedBody = body.replace(/^\uFEFF/, "").replace(/^\r?\n+/, "");
  return `---\nname: ${name.trim()}\ndescription: ${safeDesc}\n---\n\n${normalizedBody}`;
}

export function ensureSkillMarkdown(content: string, name: string, description: string): string {
  const parsed = parseSkillFrontmatter(content);
  if (parsed.hasFrontmatter) {
    const fmName = parsed.frontmatter.name?.trim() || name;
    const fmDesc = parsed.frontmatter.description?.trim() || description;
    return composeSkillMarkdown(fmName, fmDesc, parsed.body);
  }
  return composeSkillMarkdown(name, description, content);
}

export function defaultSkillTemplate(name: string, description: string): string {
  return composeSkillMarkdown(name, description, `# ${name}\n\n## Instructions\n\nDescribe how the agent should perform this skill.\n\n## Additional resources\n\n- Put detailed docs under \`references/\` and mention them here (e.g. \`api-details\`).\n`);
}
