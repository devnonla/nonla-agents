/** snake_case / camelCase → Title Case (e.g. edit_code → Edit Code). */
export function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

export function hasMeaningfulInput(input: unknown): boolean {
  if (input == null) return false;
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 && trimmed !== "{}" && trimmed !== "[]";
  }
  if (Array.isArray(input)) return input.length > 0;
  if (typeof input === "object") return Object.keys(input as object).length > 0;
  return true;
}
