import type { CSSProperties } from "react";

/**
 * Canonical control sizes for NonlaUI.
 * Height + radius live as `--nonla-*` CSS knobs (theme). Other metrics stay here.
 * Radius small/large = `--nonla-radius` ± 2px.
 */
export const CONTROL_SIZES = {
  small: {
    height: 24,
    fontSize: 12,
    lineHeight: 16,
    paddingInline: 7,
    paddingInlineIconStart: 8,
    paddingInlineIconEnd: 8,
    icon: 12,
    radius: 6,
  },
  default: {
    height: 32,
    fontSize: 14,
    lineHeight: 20,
    paddingInline: 11,
    paddingInlineIconStart: 11,
    paddingInlineIconEnd: 11,
    icon: 14,
    radius: 8,
  },
  large: {
    height: 40,
    fontSize: 16,
    lineHeight: 24,
    paddingInline: 15,
    paddingInlineIconStart: 15,
    paddingInlineIconEnd: 15,
    icon: 18,
    radius: 10,
  },
} as const;

export type CanonicalSize = keyof typeof CONTROL_SIZES;

/** Public size prop — aliases map to the 3 canonical sizes. */
export type ControlSize = CanonicalSize | "middle" | "medium" | "xs";

export type ControlSizeTokens = (typeof CONTROL_SIZES)[CanonicalSize];

/** Map legacy / antd aliases → small | default | large */
export function normalizeSize(size: ControlSize | undefined): CanonicalSize {
  if (size === "small" || size === "xs") return "small";
  if (size === "large") return "large";
  // default | middle | medium | undefined
  return "default";
}

export function getSizeTokens(size: ControlSize | undefined): ControlSizeTokens {
  return CONTROL_SIZES[normalizeSize(size)];
}

/** Live height from theme (`--nonla-height` / `-sm` / `-lg`). */
export function controlHeightVar(size: ControlSize | undefined): string {
  const s = normalizeSize(size);
  if (s === "small") return "var(--nonla-height-sm)";
  if (s === "large") return "var(--nonla-height-lg)";
  return "var(--nonla-height)";
}

/** Live radius from theme (`--nonla-radius`; sm = −2px, lg = +2px). */
export function controlRadiusVar(size: ControlSize | undefined): string {
  const s = normalizeSize(size);
  if (s === "small") return "var(--nonla-radius-sm)";
  if (s === "large") return "var(--nonla-radius-lg)";
  return "var(--nonla-radius)";
}

/** Soft status border — solid error/warn reads thicker than the default translucent edge. */
export function controlStatusClass(status?: "error" | "warning"): string {
  if (status === "error") return "border-[color-mix(in_oklab,var(--destructive)_55%,transparent)]";
  if (status === "warning") return "border-[color-mix(in_oklab,var(--warn)_55%,transparent)]";
  return "";
}

/** Focus surface fade — Input / Select / DatePicker / TimePicker. */
export const controlFieldTransition = "transition-[background-color] duration-[var(--nonla-dur-fast,150ms)] ease-[var(--nonla-ease-out,cubic-bezier(0.16,1,0.3,1))] motion-reduce:transition-none";

/** Shared field chrome (Input / Select / DatePicker). */
export function controlFieldStyle(size: ControlSize | undefined): CSSProperties {
  const t = getSizeTokens(size);
  return {
    height: controlHeightVar(size),
    fontSize: t.fontSize,
    lineHeight: `${t.lineHeight}px`,
    paddingLeft: t.paddingInline,
    paddingRight: t.paddingInline,
    borderRadius: controlRadiusVar(size),
  };
}

/** Square control width = height (icon-only buttons). */
export function controlSquareStyle(size: ControlSize | undefined): CSSProperties {
  const t = getSizeTokens(size);
  const h = controlHeightVar(size);
  return { width: h, height: h, paddingLeft: 0, paddingRight: 0, borderRadius: controlRadiusVar(size), fontSize: t.fontSize };
}

export function controlIconStyle(size: ControlSize | undefined): CSSProperties {
  const t = getSizeTokens(size);
  return { width: t.icon, height: t.icon };
}
