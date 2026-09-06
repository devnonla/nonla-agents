/**
 * Theme knobs for NonlaUI.
 *
 * Defaults live in `styles.css` on `:root` / `.dark` / `.nonla-ui`.
 * `--nonla-brand-soft` is derived from `--nonla-brand` unless you override it.
 * Consumers retheme without touching components:
 *   1. CSS:  `:root { --nonla-brand: #3b82f6; }`
 *   2. JS:   `<App theme={{ colors: { brand: "#3b82f6" } }} />` or `applyNonlaTheme({ brand: "#3b82f6" })`
 */

export const NONLA_THEME_KEYS = {
  bg: "--nonla-bg",
  fg: "--nonla-fg",
  fgMuted: "--nonla-fg-muted",
  fgTertiary: "--nonla-fg-tertiary",
  fgQuaternary: "--nonla-fg-quaternary",
  brand: "--nonla-brand",
  brandSoft: "--nonla-brand-soft",
  solidFg: "--nonla-solid-fg",
  danger: "--nonla-danger",
  success: "--nonla-success",
  warn: "--nonla-warn",
  link: "--nonla-link",
  radius: "--nonla-radius",
  height: "--nonla-height",
  heightSm: "--nonla-height-sm",
  heightLg: "--nonla-height-lg",
  ink: "--nonla-ink",
  surface: "--nonla-surface",
  elevated: "--nonla-elevated",
  chip: "--nonla-chip",
  chipHover: "--nonla-chip-hover",
  border: "--nonla-border",
  borderInput: "--nonla-input",
  composer: "--nonla-composer",
  blue: "--nonla-blue",
  purple: "--nonla-purple",
  cyan: "--nonla-cyan",
  green: "--nonla-green",
  magenta: "--nonla-magenta",
  pink: "--nonla-pink",
  red: "--nonla-red",
  orange: "--nonla-orange",
  yellow: "--nonla-yellow",
  volcano: "--nonla-volcano",
  geekblue: "--nonla-geekblue",
  lime: "--nonla-lime",
  gold: "--nonla-gold",
} as const;

export type NonlaThemeKnobName = keyof typeof NONLA_THEME_KEYS;
export type NonlaThemeKnob = (typeof NONLA_THEME_KEYS)[NonlaThemeKnobName];

const METRIC_KEYS = new Set<NonlaThemeKnobName>(["radius", "height", "heightSm", "heightLg"]);

export type NonlaThemeColorName = Exclude<NonlaThemeKnobName, "radius" | "height" | "heightSm" | "heightLg">;
export type NonlaThemeColors = { [K in NonlaThemeColorName]?: string };

/** Flat aliases → knob name (`colorBorder` == `colors.border`). */
const COLOR_ALIASES = {
  colorBorder: "border",
  colorBorderInput: "borderInput",
  /** @deprecated use `borderInput` / `colorBorderInput` */
  input: "borderInput",
} as const satisfies Record<string, NonlaThemeColorName>;

export const NONLA_THEME_KNOBS = Object.values(NONLA_THEME_KEYS);

export type NonlaThemeConfig = {
  [K in NonlaThemeKnobName]?: string;
} & {
  /** Grouped color knobs — same names as the flat keys (`colors.border`, `colors.borderInput`, …). */
  colors?: NonlaThemeColors;
  /** Alias of `colors.border` / `border`. */
  colorBorder?: string;
  /** Alias of `colors.borderInput` / `borderInput`. */
  colorBorderInput?: string;
  /** Extra CSS custom properties (include the leading `--`). */
  vars?: Record<string, string>;
};

function entriesOf(theme: NonlaThemeConfig): [string, string][] {
  const map = new Map<string, string>();
  const set = (key: string, value: unknown) => {
    if (typeof value !== "string" || !value) return;
    const knob = (COLOR_ALIASES as Record<string, NonlaThemeKnobName>)[key] ?? (key as NonlaThemeKnobName);
    const prop = NONLA_THEME_KEYS[knob];
    if (prop) map.set(prop, value);
  };

  if (theme.colors) {
    for (const [key, value] of Object.entries(theme.colors)) {
      if (METRIC_KEYS.has(key as NonlaThemeKnobName)) continue;
      set(key, value);
    }
  }
  set("colorBorder", theme.colorBorder);
  set("colorBorderInput", theme.colorBorderInput);
  for (const key of Object.keys(NONLA_THEME_KEYS) as NonlaThemeKnobName[]) {
    set(key, theme[key]);
  }
  if (theme.vars) {
    for (const [prop, value] of Object.entries(theme.vars)) {
      if (value) map.set(prop, value);
    }
  }
  return [...map.entries()];
}

/** Apply knobs on an element (defaults to `:root`). Returns a restore function. */
export function applyNonlaTheme(theme: NonlaThemeConfig, target: HTMLElement = document.documentElement): () => void {
  const entries = entriesOf(theme);
  const prev = entries.map(([prop]) => [prop, target.style.getPropertyValue(prop)] as const);
  for (const [prop, value] of entries) target.style.setProperty(prop, value);
  return () => {
    for (const [prop, value] of prev) {
      if (value) target.style.setProperty(prop, value);
      else target.style.removeProperty(prop);
    }
  };
}
