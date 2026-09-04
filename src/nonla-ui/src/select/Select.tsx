import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  forwardRef,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "../lib/cn";
import { type ControlSize, controlFieldStyle, controlFieldTransition, controlStatusClass } from "../lib/sizes";

export type SelectValue = string | number;

export type SelectOptionConfig = {
  label: ReactNode;
  value: SelectValue;
  disabled?: boolean;
};

export type SelectProps = {
  value?: SelectValue | null;
  defaultValue?: SelectValue | null;
  // antd interop: call sites often use (v: string) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange?: (value: any) => void;
  // Looser antd interop — many call sites type handlers as `(v: string) => void`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: SelectOptionConfig[];
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  showSearch?: boolean | { optionFilterProp?: "label" | "value" | string };
  popupMatchSelectWidth?: boolean;
  size?: ControlSize;
  status?: "error" | "warning";
  className?: string;
  popupClassName?: string;
  children?: ReactNode;
  /** antd alias */
  onSelect?: (value: SelectValue) => void;
};

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="opacity-60">
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (isValidElement(node)) return textOf((node as ReactElement<{ children?: ReactNode }>).props.children);
  return "";
}

function optionSearchText(opt: SelectOptionConfig, prop: string): string {
  if (prop === "value") return String(opt.value);
  return textOf(opt.label) || String(opt.value);
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    value,
    defaultValue,
    onChange,
    onSelect,
    options = [],
    placeholder = "Select",
    disabled,
    allowClear,
    showSearch,
    popupMatchSelectWidth = true,
    size,
    status,
    className,
    popupClassName,
  },
  ref,
) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState<SelectValue | null>(defaultValue ?? null);
  const selected = controlled ? (value ?? null) : inner;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [triggerW, setTriggerW] = useState<number>();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const searchable = Boolean(showSearch);
  const filterProp =
    typeof showSearch === "object" ? (showSearch.optionFilterProp ?? "value") : "value";

  const selectedOpt = options.find((o) => o.value === selected);

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => optionSearchText(o, filterProp).toLowerCase().includes(q));
  }, [options, query, searchable, filterProp]);

  useLayoutEffect(() => {
    if (!open) return;
    const w = triggerRef.current?.offsetWidth;
    if (w) setTriggerW(w);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
      return;
    }
    const idx = options.findIndex((o) => o.value === selected);
    setActive(idx >= 0 ? idx : 0);
    if (searchable) {
      const t = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open, searchable]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-active='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [active, filtered]);

  const commit = (next: SelectValue | null) => {
    if (!controlled) setInner(next);
    onChange?.(next);
    if (next != null) onSelect?.(next);
    setOpen(false);
  };

  const move = (dir: 1 | -1) => {
    const enabledIdx = filtered.map((o, i) => ({ o, i })).filter((x) => !x.o.disabled);
    if (!enabledIdx.length) return;
    const cur = enabledIdx.findIndex((x) => x.i === active);
    const from = cur < 0 ? (dir === 1 ? -1 : 0) : cur;
    const next = enabledIdx[(from + dir + enabledIdx.length) % enabledIdx.length];
    if (next) setActive(next.i);
  };

  const pickActive = () => {
    const opt = filtered[active];
    if (opt && !opt.disabled) commit(opt.value);
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickActive();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const setRefs = (node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLButtonElement | null }).current = node;
  };

  const showClear = allowClear && selected != null && selected !== "" && !disabled;

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(v) => {
        if (disabled) return;
        setOpen(v);
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          ref={setRefs}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "group/select inline-flex w-full cursor-pointer items-center gap-2 border border-solid border-input bg-[var(--control-bg,#212121)] text-left text-foreground",
            controlFieldTransition,
            "focus:bg-[var(--control-bg-hover,#2a2a2a)] data-[state=open]:bg-[var(--control-bg-hover,#2a2a2a)]",
            "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45",
            controlStatusClass(status),
            className,
          )}
          style={controlFieldStyle(size)}
          onKeyDown={onTriggerKey}
        >
          <span className={cn("min-w-0 flex-1 truncate", selected == null || selected === "" ? "text-quaternary-foreground" : "")}>
            {selectedOpt ? selectedOpt.label : selected != null && selected !== "" ? String(selected) : placeholder}
          </span>
          {showClear ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear"
              className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground group-hover/select:opacity-100"
              onPointerDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                commit(null);
              }}
            >
              <ClearIcon />
            </span>
          ) : null}
          <Chevron />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => {
            if (searchable) {
              e.preventDefault();
              searchRef.current?.focus();
            }
          }}
          onKeyDown={onListKey}
          className={cn(
            "z-[9999] overflow-hidden rounded-lg border border-[var(--popper-border)] bg-popover p-0 text-popover-foreground shadow-[var(--popper-shadow)] outline-none nonla-popper",
            popupClassName,
          )}
          style={{
            minWidth: triggerW,
            width: popupMatchSelectWidth ? triggerW : undefined,
          }}
        >
          {searchable ? (
            <div className="border-b border-border p-1.5">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Search…"
                className="h-7 w-full rounded-md border-0 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-quaternary-foreground"
              />
            </div>
          ) : null}
          <div ref={listRef} role="listbox" tabIndex={-1} className="max-h-72 overflow-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2.5 py-2 text-sm text-muted-foreground">No results</div>
            ) : (
              filtered.map((opt, i) => (
                <div
                  key={String(opt.value)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={opt.value === selected}
                  data-active={i === active ? "true" : undefined}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-md px-2.5 py-1.5 text-sm outline-none",
                    opt.disabled && "pointer-events-none opacity-40",
                    i === active && !opt.disabled && "bg-white/8",
                    opt.value === selected && "text-foreground",
                  )}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (!opt.disabled) commit(opt.value);
                  }}
                >
                  {opt.label}
                </div>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
});

/** API compat — options-as-children is not parsed; pass `options`. */
export function SelectOption({ children }: { value: SelectValue; disabled?: boolean; children?: ReactNode }) {
  return <>{children}</>;
}
