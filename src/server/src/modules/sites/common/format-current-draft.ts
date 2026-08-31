import { type SiteSourceFile, readAllSourceFiles } from "../sites-fs.js";

const FILE_PROMPT_MAX = 24_000;

/** Only app.tsx is embedded; other draft files are read on demand. */
export const DRAFT_PROMPT_FILES = ["app.tsx"] as const satisfies readonly SiteSourceFile[];

const OMITTED_DRAFT_FILES = ["backend.ts", "styles.css", "package.json"] as const satisfies readonly SiteSourceFile[];

export function clipForPrompt(content: string): string {
  if (content.length <= FILE_PROMPT_MAX) return content;
  return `${content.slice(0, FILE_PROMPT_MAX)}\n…[truncated ${content.length - FILE_PROMPT_MAX} chars — call read_site_files({ file }) for the rest]`;
}

export function formatCurrentDraftBlock(files: Record<SiteSourceFile, string>): string {
  const embedded = DRAFT_PROMPT_FILES.map((file) => `=== ${file} ===\n${clipForPrompt(files[file])}`).join("\n\n");
  const omitted = OMITTED_DRAFT_FILES.map((file) => `=== ${file} ===\n(omitted — read_site_files when needed)`).join("\n\n");
  return `${embedded}\n\n${omitted}`;
}

export function readFormattedCurrentDraft(siteId: string): string {
  return formatCurrentDraftBlock(readAllSourceFiles(siteId, "draft"));
}
