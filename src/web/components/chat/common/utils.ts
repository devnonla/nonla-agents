// ── ChatAgent internal helpers ────────────────────────────────────────────────

let _id = 0;

export function nextId(prefix = "ca") {
  return `${prefix}-${Date.now()}-${++_id}`;
}

export function prettyJson(raw: unknown): string {
  if (typeof raw === "string") {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}

/**
 * Converts a snake_case or camelCase tool name to a human-readable Title Case label.
 * e.g. "edit_code" → "Edit Code"
 *      "getCurrentTime"    → "Get Current Time"
 */
export function formatToolName(name: string): string {
  return (
    name
      // insert space before uppercase letters (camelCase)
      .replace(/([A-Z])/g, " $1")
      // replace underscores/hyphens with spaces
      .replace(/[_-]+/g, " ")
      .trim()
      // Title Case each word
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
