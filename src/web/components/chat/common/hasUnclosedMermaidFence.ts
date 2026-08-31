type FenceScan = {
  mermaidCount: number;
  hasUnclosedMermaid: boolean;
};

export function scanMermaidFences(markdown: string): FenceScan {
  let openLang: string | null = null;
  let mermaidCount = 0;

  for (const line of markdown.split("\n")) {
    const m = /^(```+|~~~+)(.*)$/.exec(line);
    if (!m) continue;

    const info = m[2].trim();
    if (openLang === null) {
      openLang = (info.split(/\s+/)[0] ?? "").toLowerCase();
      if (openLang === "mermaid") mermaidCount += 1;
    } else if (!info) {
      openLang = null;
    }
  }

  return { mermaidCount, hasUnclosedMermaid: openLang === "mermaid" };
}

/**
 * Body of the still-open mermaid fence (no closing ```), or null if none.
 * Matches react-markdown's code children (trailing newline stripped).
 */
export function getOpenMermaidBody(markdown: string): string | null {
  let openLang: string | null = null;
  let bodyStart = -1;
  const lines = markdown.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const m = /^(```+|~~~+)(.*)$/.exec(lines[i]!);
    if (!m) continue;

    const info = m[2]!.trim();
    if (openLang === null) {
      openLang = (info.split(/\s+/)[0] ?? "").toLowerCase();
      bodyStart = openLang === "mermaid" ? i + 1 : -1;
    } else if (!info) {
      openLang = null;
      bodyStart = -1;
    }
  }

  if (openLang !== "mermaid" || bodyStart < 0) return null;
  return lines.slice(bodyStart).join("\n").replace(/\n$/, "");
}

/** True when this mermaid code block is the still-streaming (unclosed) fence. */
export function isPendingMermaidBlock(markdown: string, codeText: string, streaming: boolean): boolean {
  if (!streaming) return false;
  const openBody = getOpenMermaidBody(markdown);
  return openBody !== null && openBody === codeText;
}
