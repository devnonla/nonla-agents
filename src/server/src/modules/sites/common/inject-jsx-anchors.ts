/**
 * Inject data-ra="file:L#" onto JSX opening tags so draft SSR HTML
 * can point Inspect selections back to route.jsx source lines.
 * Source files on disk stay unchanged — only the runtime copy is transformed.
 */

// Allow EOL so multiline tags like `<div\n  style=...>` still get anchors
const OPEN_TAG_RE = /<([A-Za-z][A-Za-z0-9.]*)(?=[\s/>]|$)/g;

function isLikelyInLineComment(line: string, index: number): boolean {
  const before = line.slice(0, index);
  const comment = before.lastIndexOf("//");
  if (comment === -1) return false;
  const quoteCount = (before.slice(0, comment).match(/['"`]/g) ?? []).length;
  return quoteCount % 2 === 0;
}

function oddUnescapedQuotes(line: string, index: number, quote: "'" | '"'): boolean {
  let count = 0;
  for (let i = 0; i < index; i++) {
    if (line[i] === quote && line[i - 1] !== "\\") count++;
  }
  return count % 2 === 1;
}

function isLikelyInString(line: string, index: number): boolean {
  return oddUnescapedQuotes(line, index, "'") || oddUnescapedQuotes(line, index, '"');
}

/** Add data-ra anchors to JSX open tags. Idempotent if anchors already present. */
export function injectJsxSourceAnchors(code: string, fileName: string): string {
  const lines = code.split("\n");
  return lines
    .map((line, idx) => {
      const lineNo = idx + 1;
      if (!line.includes("<") || line.includes(`data-ra="${fileName}:`)) return line;

      OPEN_TAG_RE.lastIndex = 0;
      let out = "";
      let last = 0;
      for (;;) {
        const match = OPEN_TAG_RE.exec(line);
        if (!match) break;
        const at = match.index;
        // Skip closing tags / `<=` / `<<`
        if (at > 0 && (line[at - 1] === "<" || line[at - 1] === "/")) continue;
        if (isLikelyInLineComment(line, at) || isLikelyInString(line, at)) continue;

        // Skip if this open tag already has data-ra before its end on this line
        const rest = line.slice(at);
        const tagEnd = rest.search(/\/?>/);
        const tagChunk = tagEnd >= 0 ? rest.slice(0, tagEnd) : rest;
        if (tagChunk.includes("data-ra=")) continue;

        const insertAt = at + match[0].length;
        out += `${line.slice(last, insertAt)} data-ra="${fileName}:L${lineNo}"`;
        last = insertAt;
      }
      out += line.slice(last);
      return out;
    })
    .join("\n");
}
