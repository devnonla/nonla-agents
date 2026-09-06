import type { CSSProperties, ReactNode } from "react";
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

const NAMED_VAR: Record<string, string> = {
  success: "var(--success)",
  error: "var(--destructive)",
  warning: "var(--warn)",
  processing: "var(--link)",
  brand: "var(--brand)",
  blue: "var(--nonla-blue)",
  purple: "var(--nonla-purple)",
  cyan: "var(--nonla-cyan)",
  green: "var(--nonla-green)",
  magenta: "var(--nonla-magenta)",
  pink: "var(--nonla-pink)",
  orange: "var(--nonla-orange)",
  gold: "var(--nonla-gold)",
  red: "var(--nonla-red)",
  yellow: "var(--nonla-yellow)",
  volcano: "var(--nonla-volcano)",
  geekblue: "var(--nonla-geekblue)",
  lime: "var(--nonla-lime)",
};

const SOFT = "bg-[color-mix(in_oklab,var(--nonla-tag)_12%,transparent)] text-[color-mix(in_oklab,var(--nonla-tag)_72%,white)]";
const SOLID = "bg-(--nonla-tag) text-[var(--nonla-solid-fg)]";

function resolveVariant(variant: TagProps["variant"]): TagVariant {
  if (variant === "solid") return "solid";
  return "soft";
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
  const named = NAMED_VAR[color];
  const isDefault = color === "default";
  const token = named ?? (isDefault ? undefined : color);
  const mode = resolveVariant(variant);
  const solid = mode === "solid";
  const showDot = (dot ?? (!solid && !isDefault)) && Boolean(token || isDefault);

  return (
    <span
      className={cn(
        "inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium tracking-[0.01em]",
        isDefault && (solid ? "bg-white/[0.14] text-(--nonla-ink)" : "bg-white/[0.06] text-muted-foreground"),
        !isDefault && (solid ? SOLID : SOFT),
        className,
      )}
      style={token ? ({ "--nonla-tag": token } as CSSProperties) : undefined}
    >
      {showDot ? (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", isDefault ? "bg-(--nonla-fg-muted)" : "bg-(--nonla-tag)")}
          aria-hidden
        />
      ) : null}
      <span className="min-w-0 overflow-clip text-ellipsis whitespace-nowrap [overflow-clip-margin:4px] [text-box:trim-both_cap_alphabetic]">
        {children}
      </span>
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
