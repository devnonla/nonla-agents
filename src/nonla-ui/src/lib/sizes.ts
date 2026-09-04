import type { CSSProperties } from "react";

/**
 * Canonical control sizes for NonlaUI.
 * Edit this object — Button / Input / Select / DatePicker / TimePicker / Segmented / Table / Switch read from here.
 */
export const CONTROL_SIZES = {
  small: {
    height: 24,
    fontSize: 12,
    lineHeight: 16,
    paddingInline: 7,
    paddingInlineIconStart: 5,
    paddingInlineIconEnd: 5,
    icon: 12,
    radius: 6,
  },
  default: {
    height: 32,
    fontSize: 14,
    lineHeight: 20,
    paddingInline: 11,
    paddingInlineIconStart: 8,
    paddingInlineIconEnd: 8,
    icon: 14,
    radius: 8,
  },
  large: {
    height: 40,
    fontSize: 16,
    lineHeight: 24,
    paddingInline: 15,
    paddingInlineIconStart: 11,
    paddingInlineIconEnd: 11,
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

/** Soft status border — solid error/warn reads thicker than the default translucent edge. */
export function controlStatusClass(status?: "error" | "warning"): string {
  if (status === "error") return "border-[color-mix(in_oklab,var(--destructive)_55%,transparent)]";
  if (status === "warning") return "border-[color-mix(in_oklab,var(--warn)_55%,transparent)]";
  return "";
}

/** Focus surface fade — Input / Select / DatePicker / TimePicker. */
export const controlFieldTransition =
  "transition-[background-color] duration-[var(--nonla-dur-fast,150ms)] ease-[var(--nonla-ease-out,cubic-bezier(0.16,1,0.3,1))] motion-reduce:transition-none";

/** Shared field chrome (Input / Select / DatePicker). */
export function controlFieldStyle(size: ControlSize | undefined): CSSProperties {
  const t = getSizeTokens(size);
  return {
    height: t.height,
    fontSize: t.fontSize,
    lineHeight: `${t.lineHeight}px`,
    paddingLeft: t.paddingInline,
    paddingRight: t.paddingInline,
    borderRadius: t.radius,
  };
}

/** Square control width = height (icon-only buttons). */
export function controlSquareStyle(size: ControlSize | undefined): CSSProperties {
  const t = getSizeTokens(size);
  return { width: t.height, height: t.height, paddingLeft: 0, paddingRight: 0, borderRadius: t.radius, fontSize: t.fontSize };
}

export function controlIconStyle(size: ControlSize | undefined): CSSProperties {
  const t = getSizeTokens(size);
  return { width: t.icon, height: t.icon };
}
