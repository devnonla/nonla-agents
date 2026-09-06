import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { type ControlSize, controlHeightVar, normalizeSize } from "../lib/sizes";

export type PaginationItemType = "page" | "prev" | "next" | "jump-prev" | "jump-next";

export type PaginationProps = {
  current?: number;
  pageSize?: number;
  total?: number;
  onChange?: (page: number, pageSize: number) => void;
  showSizeChanger?: boolean;
  className?: string;
  simple?: boolean;
  disabled?: boolean;
  size?: ControlSize;
  itemRender?: (page: number, type: PaginationItemType, originalElement: ReactNode) => ReactNode;
};

function pageList(current: number, pages: number): (number | "ellipsis")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set<number>([1, pages, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (current >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => set.add(n));
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i]!;
    if (i > 0 && n - nums[i - 1]! > 1) out.push("ellipsis");
    out.push(n);
  }
  return out;
}

function ItemBtn({
  children,
  active,
  disabled,
  onClick,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn("inline-flex min-w-7 cursor-pointer items-center justify-center rounded-md px-1.5 text-sm transition-colors", "disabled:cursor-not-allowed disabled:opacity-40", active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-white/6 hover:text-foreground", className)}
    >
      {children}
    </button>
  );
}

export function Pagination({ current = 1, pageSize = 10, total = 0, onChange, className, disabled, size, itemRender }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const compact = normalizeSize(size) === "small";
  const h = compact ? controlHeightVar(size) : 28;

  const wrap = (page: number, type: PaginationItemType, node: ReactNode) => (itemRender ? itemRender(page, type, node) : node);

  const prev = wrap(
    current - 1,
    "prev",
    <ItemBtn disabled={disabled || current <= 1} onClick={() => onChange?.(current - 1, pageSize)}>
      ‹
    </ItemBtn>,
  );
  const next = wrap(
    current + 1,
    "next",
    <ItemBtn disabled={disabled || current >= pages} onClick={() => onChange?.(current + 1, pageSize)}>
      ›
    </ItemBtn>,
  );

  return (
    <div className={cn("inline-flex items-center gap-0.5", className)} style={{ height: h }}>
      {prev}
      {pageList(current, pages).map((item, i, list) => {
        if (item === "ellipsis") {
          return (
            <span key={`ellipsis-${list[i - 1]}-${list[i + 1]}`} className="px-1 text-sm text-muted-foreground">
              …
            </span>
          );
        }
        const node = (
          <ItemBtn active={item === current} disabled={disabled} onClick={() => onChange?.(item, pageSize)}>
            {item}
          </ItemBtn>
        );
        return <span key={item}>{wrap(item, "page", node)}</span>;
      })}
      {next}
    </div>
  );
}
