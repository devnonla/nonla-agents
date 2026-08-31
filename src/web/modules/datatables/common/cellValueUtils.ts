import type { DatatableColumn } from "src/common/types";

export function parseNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function numberStep(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  const s = String(value);
  const dot = s.indexOf(".");
  if (dot < 0) return 1;
  const decimals = s.length - dot - 1;
  if (decimals <= 0) return 1;
  return Number(`1e-${decimals}`);
}

export function roundToStep(n: number, step: number): number {
  if (!Number.isFinite(n)) return n;
  const decimals = Math.max(0, Math.round(-Math.log10(step)));
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function cellValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
}

export function valueToDraft(col: DatatableColumn, value: unknown): string {
  if (value == null || value === "") return "";
  if (col.type === "json") {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function draftToValue(col: DatatableColumn, draft: string): unknown {
  const trimmed = draft.trim();
  switch (col.type) {
    case "number": {
      if (trimmed === "") return null;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : draft;
    }
    case "json": {
      if (trimmed === "") return null;
      try {
        return JSON.parse(draft);
      } catch {
        return draft;
      }
    }
    case "datetime":
      return trimmed === "" ? null : draft;
    default:
      return draft === "" ? null : draft;
  }
}
