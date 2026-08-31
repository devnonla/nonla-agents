/**
 * Exact search/replace with multi-pass matching (exact → EOL → trailing-WS).
 * Flexible matches still replace the original source span (never write a normalized-only buffer).
 */

export type EditHunk = {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

export type ApplyEditError = {
  ok: false;
  error: string;
  hint?: string;
};

export type ApplyEditSuccess = {
  ok: true;
  content: string;
  replacements: number;
};

export type ApplyEditResult = ApplyEditSuccess | ApplyEditError;

export const EDIT_PAYLOAD_OMITTED = "[omitted — see latest tool result / system draft]";

export function normalizeToLf(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripTrailingWsPerLine(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

type Span = { start: number; end: number };

function findSpansExact(haystack: string, needle: string): Span[] {
  if (!needle) return [];
  const spans: Span[] = [];
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    spans.push({ start: idx, end: idx + needle.length });
    from = idx + needle.length;
  }
  return spans;
}

/** Map [start,end) in stripTrailingWsPerLine(hLf) back to indices in hLf. */
function mapStrippedSpanToOriginal(hLf: string, tStart: number, tEnd: number): Span | null {
  const origLines = hLf.split("\n");
  let tPos = 0;
  let oPos = 0;
  let start: number | null = null;
  let end: number | null = null;

  for (let li = 0; li < origLines.length; li++) {
    const line = origLines[li];
    const stripped = line.replace(/[ \t]+$/g, "");
    const tLineStart = tPos;
    const tLineEnd = tPos + stripped.length;

    const mapCol = (tCol: number): number => {
      const local = tCol - tLineStart;
      if (local < 0) return oPos;
      if (local <= stripped.length) return oPos + local;
      return oPos + line.length;
    };

    if (start == null && tStart >= tLineStart && tStart <= tLineEnd) {
      start = mapCol(tStart);
    }
    if (end == null && tEnd >= tLineStart && tEnd <= tLineEnd) {
      end = mapCol(tEnd);
    }

    tPos = tLineEnd + (li < origLines.length - 1 ? 1 : 0);
    oPos += line.length + (li < origLines.length - 1 ? 1 : 0);

    if (start != null && end != null) break;
  }

  if (start == null || end == null || end < start) return null;
  return { start, end };
}

function findTrailingWsSpans(haystackLf: string, needleLf: string): Span[] {
  const hStrip = stripTrailingWsPerLine(haystackLf);
  const nStrip = stripTrailingWsPerLine(needleLf);
  if (!nStrip) return [];
  const spansT = findSpansExact(hStrip, nStrip);
  const mapped: Span[] = [];
  for (const st of spansT) {
    const span = mapStrippedSpanToOriginal(haystackLf, st.start, st.end);
    if (span) mapped.push(span);
  }
  return mapped;
}

function findSpans(haystackLf: string, needle: string): { spans: Span[]; pass: "exact" | "eol" | "trailing-ws" } {
  const needleLf = normalizeToLf(needle);

  const exact = findSpansExact(haystackLf, needleLf);
  if (exact.length > 0) return { spans: exact, pass: "exact" };

  // EOL pass: needle already LF-normalized; haystack is LF — same as exact when inputs are LF.
  // Kept for callers that pass mixed EOL in needle only (already handled by needleLf).
  // Trailing-WS pass:
  const trailing = findTrailingWsSpans(haystackLf, needleLf);
  if (trailing.length > 0) return { spans: trailing, pass: "trailing-ws" };

  return { spans: [], pass: "exact" };
}

function applyOneReplace(contentLf: string, hunk: EditHunk): ApplyEditResult {
  const { old_string, new_string, replace_all } = hunk;
  if (!old_string) {
    return { ok: false, error: "old_string must be non-empty", hint: "Provide a unique snippet to replace." };
  }
  if (old_string === new_string) {
    return { ok: false, error: "no-op edit: old_string equals new_string" };
  }

  const { spans } = findSpans(contentLf, old_string);
  if (spans.length === 0) {
    return {
      ok: false,
      error: "old_string not found (tried exact, EOL, trailing-whitespace).",
      hint: "Copy old_string verbatim from the latest tool-result snapshot (or <current_code>). Or use mode=full for a full rewrite.",
    };
  }

  if (spans.length > 1 && !replace_all) {
    return {
      ok: false,
      error: `old_string matched ${spans.length} times (ambiguous).`,
      hint: "Add more surrounding context to old_string, or set replace_all: true.",
    };
  }

  const toApply = (replace_all ? spans : [spans[0]]).sort((a, b) => b.start - a.start);
  let next = contentLf;
  const replacement = normalizeToLf(new_string);
  for (const s of toApply) {
    next = next.slice(0, s.start) + replacement + next.slice(s.end);
  }
  return { ok: true, content: next, replacements: toApply.length };
}

/** Apply multiple hunks atomically. On any failure, original content is unchanged. */
export function applyEdits(content: string, edits: EditHunk[]): ApplyEditResult {
  if (!Array.isArray(edits) || edits.length === 0) {
    return {
      ok: false,
      error: "edits must be a non-empty array",
      hint: "Provide at least one { old_string, new_string } or use mode=full.",
    };
  }

  const original = normalizeToLf(content);
  let current = original;
  let total = 0;
  for (let i = 0; i < edits.length; i++) {
    const result = applyOneReplace(current, edits[i]);
    if (!result.ok) {
      return {
        ok: false,
        error: `edit[${i}] failed: ${result.error}`,
        hint: result.hint,
      };
    }
    current = result.content;
    total += result.replacements;
  }
  return { ok: true, content: current, replacements: total };
}

export function applyExactReplace(content: string, old_string: string, new_string: string, replace_all = false): ApplyEditResult {
  return applyEdits(content, [{ old_string, new_string, replace_all }]);
}
