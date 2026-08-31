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

/** True for legacy `call_agent` and per-target `call_agent__<uuid>` tools */
export function isCallAgentToolName(name: string | null | undefined): boolean {
  if (!name) return false;
  return name === "call_agent" || name.startsWith("call_agent__");
}

/** Reconstruct target agent UUID from `call_agent__<uuid_with_underscores>` */
export function parseCallAgentToolTargetId(toolName: string): string | null {
  if (!toolName.startsWith("call_agent__")) return null;
  const parts = toolName.slice("call_agent__".length).split("_");
  if (parts.length !== 5) return null;
  return parts.join("-");
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

/**
 * Ensure a hex color is dark enough for readable text on light backgrounds.
 * Converts to HSL, clamps lightness to maxL (default 40%).
 * - Dark colors (L ≤ 40%) → returned as-is
 * - Light/pastel colors → darkened to L=40% while preserving hue & saturation
 */
export function darkenColor(hex: string, maxL = 40): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return hex;

  // Parse RGB
  let r = Number.parseInt(h.substring(0, 2), 16) / 255;
  let g = Number.parseInt(h.substring(2, 4), 16) / 255;
  let b = Number.parseInt(h.substring(4, 6), 16) / 255;

  // RGB → HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  let sat = 0;
  let lit = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    sat = lit > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / d + 2) / 6;
    else hue = ((r - g) / d + 4) / 6;
  }

  // Clamp lightness
  const litPct = lit * 100;
  if (litPct <= maxL) return hex; // already dark enough

  lit = maxL / 100;

  // HSL → RGB
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  if (sat === 0) {
    r = g = b = lit;
  } else {
    const q = lit < 0.5 ? lit * (1 + sat) : lit + sat - lit * sat;
    const p = 2 * lit - q;
    r = hue2rgb(p, q, hue + 1 / 3);
    g = hue2rgb(p, q, hue);
    b = hue2rgb(p, q, hue - 1 / 3);
  }

  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
