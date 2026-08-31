import { type SiteSourceFile, readSourceFile } from "../sites-fs.js";

export type SelectionResolveInput = {
  sourceAnchor?: string;
  tagName?: string;
  className?: string;
  text?: string;
  outerHtml?: string;
};

export type SelectionResolveResult = {
  sourceAnchor?: string;
  file: string;
  line?: number;
  excerpt: string;
  matchMethod: "anchor" | "fuzzy" | "none";
};

function numberedExcerpt(lines: string[], line: number, before = 4, after = 10): string {
  const start = Math.max(1, line - before);
  const end = Math.min(lines.length, line + after);
  return lines
    .slice(start - 1, end)
    .map((text, i) => `${String(start + i).padStart(4, " ")}| ${text}`)
    .join("\n");
}

function parseAnchor(anchor: string): { file: SiteSourceFile; line: number } | null {
  const m = /^(app\.tsx|backend\.ts|data\.ts|actions\.ts|route\.jsx|loader\.js|action\.js):L(\d+)$/.exec(anchor.trim());
  if (!m) return null;
  const file = m[1];
  if (file === "app.tsx" || file === "backend.ts") {
    return { file, line: Number(m[2]) };
  }
  // Legacy anchors map to backend or app
  if (file === "data.ts" || file === "actions.ts") {
    return { file: "backend.ts", line: Number(m[2]) };
  }
  return { file: "app.tsx", line: Number(m[2]) };
}

function scoreLine(line: string, input: SelectionResolveInput): number {
  let score = 0;
  const lower = line.toLowerCase();
  if (input.tagName) {
    const tag = input.tagName.toLowerCase();
    if (lower.includes(`<${tag}`) || lower.includes(`</${tag}`)) score += 4;
  }
  if (input.className) {
    for (const cls of input.className.split(/\s+/).filter(Boolean).slice(0, 3)) {
      if (line.includes(cls)) score += 3;
    }
  }
  if (input.text) {
    const snippet = input.text.slice(0, 40).trim();
    if (snippet.length >= 3 && line.includes(snippet)) score += 5;
    const words = snippet
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3);
    for (const w of words) {
      if (line.includes(w)) score += 1;
    }
  }
  if (input.outerHtml) {
    const m = /class=["']([^"']+)/.exec(input.outerHtml);
    if (m?.[1]) {
      for (const cls of m[1].split(/\s+/).slice(0, 2)) {
        if (cls && line.includes(cls)) score += 2;
      }
    }
  }
  return score;
}

function fuzzyFind(file: SiteSourceFile, content: string, input: SelectionResolveInput): SelectionResolveResult {
  const lines = content.split("\n");
  let bestLine = 0;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const s = scoreLine(lines[i], input);
    if (s > bestScore) {
      bestScore = s;
      bestLine = i + 1;
    }
  }
  if (bestScore < 4 || bestLine === 0) {
    return {
      file,
      excerpt: lines
        .slice(0, Math.min(40, lines.length))
        .map((text, i) => `${String(i + 1).padStart(4, " ")}| ${text}`)
        .join("\n"),
      matchMethod: "none",
    };
  }
  return {
    sourceAnchor: `${file}:L${bestLine}`,
    file,
    line: bestLine,
    excerpt: numberedExcerpt(lines, bestLine),
    matchMethod: "fuzzy",
  };
}

/** Map an Inspect selection back to draft source excerpt for the LLM. */
export function resolveSiteSelection(siteId: string, input: SelectionResolveInput): SelectionResolveResult {
  if (input.sourceAnchor) {
    const parsed = parseAnchor(input.sourceAnchor);
    if (parsed) {
      const content = readSourceFile(siteId, "draft", parsed.file);
      const lines = content.split("\n");
      if (parsed.line >= 1 && parsed.line <= lines.length) {
        return {
          sourceAnchor: input.sourceAnchor,
          file: parsed.file,
          line: parsed.line,
          excerpt: numberedExcerpt(lines, parsed.line),
          matchMethod: "anchor",
        };
      }
    }
  }

  const app = readSourceFile(siteId, "draft", "app.tsx");
  return fuzzyFind("app.tsx", app, input);
}
