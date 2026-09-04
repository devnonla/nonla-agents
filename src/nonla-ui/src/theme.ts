/**
 * Theme knobs for NonlaUI — app dark palette.
 * Set on `:root` / `.dark` / `.nonla-ui`; mapped to shadcn tokens in styles.css.
 *
 * Core:
 *   --nonla-bg #121212, --nonla-fg #d4d4d4, --nonla-brand #dd7627,
 *   --nonla-brand-soft #ffa333, --nonla-danger, --nonla-success,
 *   --nonla-warn, --nonla-link, --nonla-radius
 *
 * Surfaces (also overridable):
 *   --nonla-surface #191919, --nonla-elevated #1e1e1e,
 *   --nonla-chip #212121, --nonla-chip-hover #2a2a2a, --nonla-ink #e8e8e8
 *
 * Shadcn: --background, --foreground, --card, --popover, --primary (ink),
 *   --secondary, --muted, --accent, --destructive, --border, --input, --ring
 * Nonla CTA: --brand / --brand-soft (not --primary)
 */
export const NONLA_THEME_KNOBS = [
  "--nonla-bg",
  "--nonla-fg",
  "--nonla-brand",
  "--nonla-brand-soft",
  "--nonla-danger",
  "--nonla-success",
  "--nonla-warn",
  "--nonla-link",
  "--nonla-radius",
] as const;

export type NonlaThemeKnob = (typeof NONLA_THEME_KNOBS)[number];
