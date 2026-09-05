/**
 * Normalize untrusted TS/TSX before Bun parses it in the sandbox.
 *
 * Two host-transpiler traps show up constantly in agent-generated code:
 *  1. Regex literals starting with `^` (`/^\/+|\/+$/g`) parse as division+XOR
 *     (`Unexpected ^`) after ASI / in some TSX positions.
 *  2. Sandbox `bun build` / strict checking rejects loose `unknown` ↔ `string`
 *     casts. Executed copies get `// @ts-nocheck` so type errors stay in the
 *     editor, not the worker.
 */

const REGEX_FLAGS = /^[dgimsuvy]*/;
const TS_NOCHECK = "// @ts-nocheck";

export const SANDBOX_TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      jsx: "react-jsx",
      module: "ESNext",
      moduleResolution: "bundler",
      target: "ESNext",
      skipLibCheck: true,
      noEmit: true,
      strict: false,
      noImplicitAny: false,
      strictNullChecks: false,
    },
  },
  null,
  2,
)}\n`;

/** Rewrite caret regex literals and disable typechecking on the executed copy. */
export function rewriteSandboxTs(source: string): string {
  return ensureTsNocheck(rewriteCaretRegexLiterals(source));
}

function ensureTsNocheck(source: string): string {
  const text = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const body = text.startsWith("#!") ? text.slice(text.indexOf("\n") + 1) : text;
  const first = body.split("\n").find((line) => line.trim() !== "") ?? "";
  if (/^\/\/\s*@ts-nocheck\b/.test(first.trim())) return source;

  if (text.startsWith("#!")) {
    const nl = text.indexOf("\n");
    if (nl < 0) return `${text}\n${TS_NOCHECK}\n`;
    return `${text.slice(0, nl + 1)}${TS_NOCHECK}\n${text.slice(nl + 1)}`;
  }
  return `${TS_NOCHECK}\n${source}`;
}

function rewriteCaretRegexLiterals(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      if (end < 0) {
        out += source.slice(i);
        break;
      }
      out += source.slice(i, end);
      i = end;
      continue;
    }

    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) {
        out += source.slice(i);
        break;
      }
      out += source.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    if (c === "'" || c === '"') {
      const taken = readQuoted(source, i, c);
      out += taken.text;
      i = taken.next;
      continue;
    }

    if (c === "`") {
      const taken = readTemplate(source, i);
      out += taken.text;
      i = taken.next;
      continue;
    }

    if (c === "/" && next === "^") {
      const regex = readCaretRegex(source, i);
      if (regex) {
        out += regex.replacement;
        i = regex.next;
        continue;
      }
    }

    out += c;
    i += 1;
  }

  return out;
}

function readQuoted(source: string, start: number, quote: string): { text: string; next: number } {
  let i = start + 1;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === quote) return { text: source.slice(start, i + 1), next: i + 1 };
    if (c === "\n") break;
    i += 1;
  }
  return { text: source[start] ?? "", next: start + 1 };
}

function readTemplate(source: string, start: number): { text: string; next: number } {
  let i = start + 1;
  let out = "`";
  while (i < source.length) {
    const c = source[i];
    if (c === "\\") {
      out += c + (source[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (c === "`") return { text: `${out}\``, next: i + 1 };
    if (c === "$" && source[i + 1] === "{") {
      const innerStart = i + 2;
      const innerEnd = findMatchingBrace(source, innerStart);
      if (innerEnd < 0) {
        out += source.slice(i);
        return { text: out, next: source.length };
      }
      out += `\${${rewriteCaretRegexLiterals(source.slice(innerStart, innerEnd))}}`;
      i = innerEnd + 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return { text: out, next: i };
}

function findMatchingBrace(source: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end < 0 ? source.length : end;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      i = readQuoted(source, i, c).next;
      continue;
    }
    if (c === "`") {
      i = readTemplate(source, i).next;
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

function readCaretRegex(source: string, start: number): { replacement: string; next: number } | null {
  let inClass = false;
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i];
    if (c === "\n") return null;
    if (c === "\\" && i + 1 < source.length) {
      i += 1;
      continue;
    }
    if (c === "[" && !inClass) {
      inClass = true;
      continue;
    }
    if (c === "]" && inClass) {
      inClass = false;
      continue;
    }
    if (c === "/" && !inClass) {
      const pattern = source.slice(start + 1, i);
      const flags = source.slice(i + 1).match(REGEX_FLAGS)?.[0] ?? "";
      const replacement = flags ? `new RegExp(${JSON.stringify(pattern)}, ${JSON.stringify(flags)})` : `new RegExp(${JSON.stringify(pattern)})`;
      return { replacement, next: i + 1 + flags.length };
    }
  }
  return null;
}
