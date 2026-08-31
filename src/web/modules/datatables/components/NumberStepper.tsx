import { useEffect, useRef, useState } from "react";
import { cn } from "src/common/lib/cn";
import { numberStep, parseNumberValue, roundToStep } from "../common/cellValueUtils";

export function NumberStepper({
  value,
  onChange,
  onCommit,
  onCancel,
  autoFocus,
  className,
  inputClassName,
}: {
  value: unknown;
  onChange?: (v: number | null) => void;
  /** When set, blur/Enter commit the draft; Esc cancels. Used by inline cell edit. */
  onCommit?: (v: number | null) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() => {
    const n = parseNumberValue(value);
    return n == null ? "" : String(n);
  });
  const committedRef = useRef(false);

  useEffect(() => {
    const n = parseNumberValue(value);
    setDraft(n == null ? "" : String(n));
    committedRef.current = false;
  }, [value]);

  useEffect(() => {
    if (!autoFocus) return;
    const id = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
    return () => cancelAnimationFrame(id);
  }, [autoFocus]);

  const emit = (next: number | null) => {
    onChange?.(next);
  };

  const finish = (next: number | null) => {
    if (!onCommit) {
      emit(next);
      return;
    }
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(next);
  };

  const parseDraft = (): number | null => {
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  const applyStep = (dir: -1 | 1) => {
    const current = parseDraft();
    const base = current ?? 0;
    const step = numberStep(current ?? value);
    const next = roundToStep(base + dir * step, step);
    setDraft(String(next));
    emit(next);
    inputRef.current?.focus();
  };

  const btnClass = "flex h-full w-7 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-sm font-medium leading-none text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground active:bg-muted disabled:cursor-default disabled:opacity-40";

  return (
    <div className={cn("flex h-9 min-w-0 items-stretch overflow-hidden rounded-md border border-border-subtle bg-muted shadow-panel", className)}>
      <button type="button" aria-label="Decrease" tabIndex={-1} className={cn(btnClass, "border-r border-border-subtle")} onMouseDown={(e) => e.preventDefault()} onClick={() => applyStep(-1)}>
        −
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        spellCheck={false}
        className={cn("min-w-0 flex-1 border-0 bg-transparent px-1.5 text-center text-sm tabular-nums text-foreground outline-none placeholder:text-quaternary-foreground", inputClassName)}
        onChange={(e) => {
          const next = e.target.value;
          // Allow empty, minus, digits, one decimal point while typing.
          if (next !== "" && !/^-?\d*\.?\d*$/.test(next)) return;
          setDraft(next);
          if (next.trim() === "" || next === "-" || next === "." || next === "-.") {
            emit(null);
            return;
          }
          const n = Number(next);
          if (Number.isFinite(n)) emit(n);
        }}
        onBlur={() => {
          const parsed = parseDraft();
          // Normalize display (e.g. "12." → "12") and push final value.
          setDraft(parsed == null ? "" : String(parsed));
          if (onCommit) finish(parsed);
          else emit(parsed);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            if (onCancel) {
              committedRef.current = true;
              onCancel();
            }
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            finish(parseDraft());
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            applyStep(1);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            applyStep(-1);
          }
        }}
      />
      <button type="button" aria-label="Increase" tabIndex={-1} className={cn(btnClass, "border-l border-border-subtle")} onMouseDown={(e) => e.preventDefault()} onClick={() => applyStep(1)}>
        +
      </button>
    </div>
  );
}
