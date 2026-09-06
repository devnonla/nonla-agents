const SHAPES: [string, string][] = [
  ["([", "])"],
  ["[[", "]]"],
  ["[(", ")]"],
  ["((", "))"],
  ["{{", "}}"],
  ["[/", "/]"],
  ["[\\", "\\]"],
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
];

const KEYWORDS = new Set(["graph", "flowchart", "subgraph", "end", "direction", "click", "style", "classDef", "class", "linkStyle", "sequenceDiagram", "classDiagram", "stateDiagram", "erDiagram", "gantt", "pie", "journey", "gitGraph", "mindmap", "timeline", "TB", "TD", "BT", "RL", "LR"]);

const ENTITY: Record<string, string> = {
  "(": "#40;",
  ")": "#41;",
  "[": "#91;",
  "]": "#93;",
  "{": "#123;",
  "}": "#125;",
  "<": "#60;",
  ">": "#62;",
  '"': "#34;",
};

const HAS_BRACKET_RE = /[()[\]{}<>]/;
const HAS_INNER_QUOTE_RE = /"/;

function findCloser(line: string, start: number, closer: string): number {
  let inQ = false;
  for (let i = start; i <= line.length - closer.length; i++) {
    if (line[i] === '"' && (i === 0 || line[i - 1] !== "\\")) inQ = !inQ;
    if (!inQ && line.slice(i, i + closer.length) === closer) return i;
  }
  for (let i = start; i <= line.length - closer.length; i++) {
    if (line.slice(i, i + closer.length) === closer) return i;
  }
  return -1;
}

function escapeLabel(raw: string): string {
  let content = raw.trim();
  if (/^".*"$/.test(content)) content = content.slice(1, -1);
  content = content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  let out = "";
  for (const ch of content) out += ENTITY[ch] ?? ch;
  return `"${out}"`;
}

function fixSubgraphTitles(code: string): string {
  return code.replace(/^(\s*subgraph\s+)(?!")(.*\S.*)$/gm, (_, pre: string, title: string) => {
    const t = title.trim();
    if (/^".*"$/.test(t)) return `${pre}${t}`;
    return /\s/.test(t) || HAS_BRACKET_RE.test(t) ? `${pre}"${t}"` : `${pre}${t}`;
  });
}

function fixLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("%%") || /^subgraph\b/.test(trimmed) || trimmed === "end") {
    return line;
  }

  let result = "";
  let i = 0;

  while (i < line.length) {
    const m = line.slice(i).match(/^([a-zA-Z_]\w*)/);
    if (!m) {
      result += line[i];
      i++;
      continue;
    }

    const id = m[1];
    const afterId = i + id.length;

    if (KEYWORDS.has(id)) {
      result += id;
      i = afterId;
      continue;
    }

    let opener: string | null = null;
    let closer: string | null = null;
    for (const [op, cl] of SHAPES) {
      if (line.startsWith(op, afterId)) {
        opener = op;
        closer = cl;
        break;
      }
    }

    if (!opener || !closer) {
      result += id;
      i = afterId;
      continue;
    }

    const labelStart = afterId + opener.length;
    const closerPos = findCloser(line, labelStart, closer);

    if (closerPos === -1) {
      result += id + opener;
      i = labelStart;
      continue;
    }

    const rawLabel = line.slice(labelStart, closerPos);
    const unquoted = rawLabel.replace(/"[^"]*"/g, "");
    if (HAS_BRACKET_RE.test(unquoted) || HAS_INNER_QUOTE_RE.test(unquoted) || /<[^>]+>/.test(rawLabel) || (rawLabel.match(/"/g) ?? []).length > 2) {
      result += id + opener + escapeLabel(rawLabel) + closer;
    } else {
      result += id + opener + rawLabel + closer;
    }

    i = closerPos + closer.length;
  }

  return result;
}

/** Auto-fix common Mermaid syntax issues produced by LLMs. */
export function sanitizeMermaid(raw: string): string {
  let code = raw.trim();
  code = code.replace(/\*\*([^*]+)\*\*/g, "$1");
  code = code.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, "$1");
  code = fixSubgraphTitles(code);
  return code.split("\n").map(fixLine).join("\n");
}
