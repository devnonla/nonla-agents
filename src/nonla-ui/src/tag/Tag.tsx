import { type CSSProperties, type ReactNode } from "react";
import { cn } from "../lib/cn";

export type TagVariant = "soft" | "solid";

export type TagProps = {
  children?: ReactNode;
  color?: string;
  /** @deprecated prefer `variant="soft"` — kept for antd-ish callers */
  bordered?: boolean;
  /**
   * `soft` — quiet wash on dark (default).
   * `solid` — saturated chip, still tuned for dark UI (not candy).
   * `filled` / `outlined` map to `soft` for backwards compat.
   */
  variant?: TagVariant | "filled" | "outlined";
  className?: string;
  onClose?: () => void;
  closable?: boolean;
  /** Hide the leading status dot on soft colored tags. */
  dot?: boolean;
};

type Tone = {
  soft: string;
  solid: string;
  dot: string;
};

/** Soft washes + solids tuned for #121212 — avoid neon antd candy. */
const PRESET: Record<string, Tone> = {
  default: {
    soft: "bg-white/[0.06] text-[#b0b0b0]",
    solid: "bg-white/[0.14] text-[#ececec]",
    dot: "bg-[#8a8a8a]",
  },
  success: {
    soft: "bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-[color-mix(in_oklab,var(--success)_88%,white)]",
    solid: "bg-[color-mix(in_oklab,var(--success)_78%,#0a0a0a)] text-[#eafff3]",
    dot: "bg-success",
  },
  error: {
    soft: "bg-[color-mix(in_oklab,var(--destructive)_16%,transparent)] text-[color-mix(in_oklab,var(--destructive)_85%,white)]",
    solid: "bg-[color-mix(in_oklab,var(--destructive)_72%,#0a0a0a)] text-[#ffe8e8]",
    dot: "bg-destructive",
  },
  warning: {
    soft: "bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] text-[color-mix(in_oklab,var(--warn)_90%,white)]",
    solid: "bg-[color-mix(in_oklab,var(--warn)_70%,#0a0a0a)] text-[#fff6e8]",
    dot: "bg-warn",
  },
  processing: {
    soft: "bg-[color-mix(in_oklab,var(--link)_16%,transparent)] text-[color-mix(in_oklab,var(--link)_88%,white)]",
    solid: "bg-[color-mix(in_oklab,var(--link)_68%,#0a0a0a)] text-[#e8f2ff]",
    dot: "bg-link",
  },
  brand: {
    soft: "bg-[color-mix(in_oklab,var(--brand)_16%,transparent)] text-[var(--brand-soft)]",
    solid: "bg-[color-mix(in_oklab,var(--brand)_75%,#0a0a0a)] text-[#fff4e8]",
    dot: "bg-brand",
  },
  blue: {
    soft: "bg-[#3b82f6]/12 text-[#93c5fd]",
    solid: "bg-[#2563eb]/85 text-[#eff6ff]",
    dot: "bg-[#3b82f6]",
  },
  purple: {
    soft: "bg-[#8b5cf6]/12 text-[#c4b5fd]",
    solid: "bg-[#7c3aed]/85 text-[#f5f3ff]",
    dot: "bg-[#8b5cf6]",
  },
  cyan: {
    soft: "bg-[#22d3ee]/12 text-[#67e8f9]",
    solid: "bg-[#0891b2]/90 text-[#ecfeff]",
    dot: "bg-[#22d3ee]",
  },
  green: {
    soft: "bg-[#22c55e]/12 text-[#86efac]",
    solid: "bg-[#16a34a]/90 text-[#f0fdf4]",
    dot: "bg-[#22c55e]",
  },
  magenta: {
    soft: "bg-[#ec4899]/12 text-[#f9a8d4]",
    solid: "bg-[#db2777]/90 text-[#fdf2f8]",
    dot: "bg-[#ec4899]",
  },
  orange: {
    soft: "bg-[#f97316]/12 text-[#fdba74]",
    solid: "bg-[#ea580c]/90 text-[#fff7ed]",
    dot: "bg-[#f97316]",
  },
  gold: {
    soft: "bg-[#eab308]/12 text-[#fde047]",
    solid: "bg-[#ca8a04]/90 text-[#fefce8]",
    dot: "bg-[#eab308]",
  },
  red: {
    soft: "bg-[#ef4444]/12 text-[#fca5a5]",
    solid: "bg-[#dc2626]/90 text-[#fef2f2]",
    dot: "bg-[#ef4444]",
  },
};

function resolveVariant(variant: TagProps["variant"]): TagVariant {
  if (variant === "solid") return "solid";
  return "soft";
}

function customStyle(color: string, solid: boolean): CSSProperties {
  if (solid) {
    return {
      background: `color-mix(in oklab, ${color} 72%, #0a0a0a)`,
      color: "#f5f5f5",
    };
  }
  return {
    background: `color-mix(in oklab, ${color} 14%, transparent)`,
    color,
  };
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M2.2 2.2L7.8 7.8M7.8 2.2L2.2 7.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Tag({
  children,
  color = "default",
  bordered: _bordered,
  variant = "soft",
  className,
  closable,
  onClose,
  dot,
}: TagProps) {
  const tone = PRESET[color];
  const mode = resolveVariant(variant);
  const solid = mode === "solid";
  const showDot = (dot ?? (!solid && color !== "default")) && Boolean(tone || (!tone && color));

  return (
    <span
      className={cn(
        "inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium leading-none tracking-[0.01em]",
        tone ? (solid ? tone.solid : tone.soft) : null,
        className,
      )}
      style={tone ? undefined : customStyle(color, solid)}
    >
      {showDot ? (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", tone?.dot)}
          style={tone ? undefined : { background: color }}
          aria-hidden
        />
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
      {closable ? (
        <button
          type="button"
          className="-mr-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-current/55 transition-colors hover:bg-white/10 hover:text-current"
          aria-label="Remove"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      ) : null}
    </span>
  );
}
