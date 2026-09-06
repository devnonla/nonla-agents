import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { type ControlSize, controlHeightVar, controlRadiusVar, getSizeTokens, normalizeSize } from "../lib/sizes";

export type SegmentedOption<V extends string | number = string | number> = V | { label: ReactNode; value: V; disabled?: boolean; icon?: ReactNode };

export type SegmentedProps<V extends string | number = string | number> = {
  options: SegmentedOption<V>[];
  value?: V;
  defaultValue?: V;
  onChange?: (value: V) => void;
  size?: ControlSize;
  block?: boolean;
  disabled?: boolean;
  className?: string;
};

function norm<V extends string | number>(opt: SegmentedOption<V>): { label: ReactNode; value: V; disabled?: boolean; icon?: ReactNode } {
  if (typeof opt === "string" || typeof opt === "number") return { label: String(opt), value: opt };
  return opt;
}

export function Segmented<V extends string | number = string | number>({ options, value, defaultValue, onChange, size, block, disabled, className }: SegmentedProps<V>) {
  const items = options.map((o) => norm(o));
  const current = value ?? defaultValue ?? items[0]?.value;
  const tok = getSizeTokens(size);
  const itemPadX = Math.max(tok.paddingInline - 4, 6);
  const radius = controlRadiusVar(size);

  return (
    <div className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-secondary p-0.5", block && "flex w-full", className)} role="tablist" style={{ borderRadius: radius }} data-size={normalizeSize(size)}>
      {items.map((item) => {
        const active = item.value === current;
        return (
          <button
            key={String(item.value)}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled || item.disabled}
            className={cn(
              "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border-0 transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45",
              block ? "min-w-0 flex-1" : "shrink-0",
              active ? "bg-[var(--control-bg-hover)] text-foreground shadow-sm" : "bg-transparent text-muted-foreground hover:bg-white/4 hover:text-foreground",
            )}
            style={{
              height: `max(22px, calc(${controlHeightVar(size)} - 4px))`,
              paddingLeft: itemPadX,
              paddingRight: itemPadX,
              fontSize: tok.fontSize,
              borderRadius: `max(4px, calc(${radius} - 2px))`,
            }}
            onClick={() => onChange?.(item.value)}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
