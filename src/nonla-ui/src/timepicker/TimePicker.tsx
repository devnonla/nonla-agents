import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAppConfig } from "../app/App";
import { cn } from "../lib/cn";
import { type PopperPlacement, placementToRadix } from "../lib/placement";
import { type ControlSize, controlFieldStyle, controlFieldTransition, controlStatusClass, getSizeTokens } from "../lib/sizes";

export type TimeValue = { hours: number; minutes: number; seconds: number };

export type TimePickerProps = {
  /** 24h string (`HH:mm` / `HH:mm:ss`) or a Date (time-of-day is used). */
  value?: string | Date | null;
  defaultValue?: string | Date | null;
  onChange?: (time: string | null, parts: TimeValue | null) => void;
  size?: ControlSize;
  status?: "error" | "warning";
  allowClear?: boolean;
  /** `HH:mm:ss` shows a seconds column. */
  format?: "HH:mm" | "HH:mm:ss";
  use12Hours?: boolean;
  hourStep?: number;
  minuteStep?: number;
  secondStep?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  popupClassName?: string;
  placement?: PopperPlacement;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
};

type Part = "h" | "m" | "s" | "a";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function clampPart(n: number, max: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, Math.trunc(n)));
}

function stepWrap(current: number, dir: 1 | -1, max: number, step: number) {
  const count = Math.max(1, Math.floor((max + 1) / step));
  const idx = Math.round(current / step);
  return (((idx + dir) % count) + count) % count * step;
}

function to12(hours: number): { hour: number; pm: boolean } {
  const pm = hours >= 12;
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return { hour, pm };
}

function from12(hour: number, pm: boolean) {
  const h = hour === 12 ? 0 : hour;
  return h + (pm ? 12 : 0);
}

function formatDisplay(parts: TimeValue, showSeconds: boolean, use12Hours: boolean) {
  if (use12Hours) {
    const { hour, pm } = to12(parts.hours);
    const core = showSeconds ? `${pad(hour)}:${pad(parts.minutes)}:${pad(parts.seconds)}` : `${pad(hour)}:${pad(parts.minutes)}`;
    return `${core} ${pm ? "PM" : "AM"}`;
  }
  return showSeconds ? `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}` : `${pad(parts.hours)}:${pad(parts.minutes)}`;
}

function formatValue(parts: TimeValue, showSeconds: boolean) {
  return showSeconds ? `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}` : `${pad(parts.hours)}:${pad(parts.minutes)}`;
}

function nowParts(): TimeValue {
  const d = new Date();
  return { hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds() };
}

function parseTime(value: string | Date | null | undefined): TimeValue | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { hours: value.getHours(), minutes: value.getMinutes(), seconds: value.getSeconds() };
  }

  const raw = value.trim();
  if (!raw) return null;

  const ampmMatch = raw.match(/\s*([AaPp])\.?m?\.?\s*$/i);
  let body = raw;
  let pm: boolean | undefined;
  if (ampmMatch) {
    pm = ampmMatch[1].toLowerCase() === "p";
    body = raw.slice(0, ampmMatch.index).trim();
  }

  let h: number | undefined;
  let m: number | undefined;
  let s: number | undefined;

  if (body.includes(":")) {
    const bits = body.split(":");
    h = Number(bits[0]);
    m = Number(bits[1] ?? 0);
    s = Number(bits[2] ?? 0);
  } else {
    const digits = body.replace(/\D/g, "");
    if (digits.length < 1 || digits.length > 6) return null;
    if (digits.length <= 2) {
      h = Number(digits);
      m = 0;
      s = 0;
    } else if (digits.length <= 4) {
      h = Number(digits.slice(0, digits.length - 2));
      m = Number(digits.slice(-2));
      s = 0;
    } else {
      h = Number(digits.slice(0, digits.length - 4));
      m = Number(digits.slice(-4, -2));
      s = Number(digits.slice(-2));
    }
  }

  if (![h, m, s].every((n) => Number.isFinite(n))) return null;
  let hours = clampPart(h!, 23);
  const minutes = clampPart(m!, 59);
  const seconds = clampPart(s!, 59);

  if (pm != null) {
    const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    hours = from12(hour12, pm);
  }

  return { hours, minutes, seconds };
}

function partFromCaret(caret: number, showSeconds: boolean, use12Hours: boolean): Part {
  const i = Math.max(0, caret);
  if (i <= 2) return "h";
  if (i <= 5) return "m";
  if (showSeconds && i <= 8) return "s";
  if (use12Hours) return "a";
  return showSeconds ? "s" : "m";
}

function ClockIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 opacity-55">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 7.5V12L15.2 14.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
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

function Chevron({ dir }: { dir: "up" | "down" | "left" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      {dir === "up" ? (
        <path d="M4 10L8 6L12 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      ) : dir === "down" ? (
        <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function useHoldRepeat(onStep: (dir: 1 | -1) => void) {
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const delayRef = useRef(0);
  const intervalRef = useRef(0);

  const stop = useCallback(() => {
    window.clearTimeout(delayRef.current);
    window.clearInterval(intervalRef.current);
    delayRef.current = 0;
    intervalRef.current = 0;
  }, []);

  const start = useCallback(
    (dir: 1 | -1) => {
      stop();
      onStepRef.current(dir);
      delayRef.current = window.setTimeout(() => {
        intervalRef.current = window.setInterval(() => onStepRef.current(dir), 75);
      }, 380);
    },
    [stop],
  );

  useEffect(() => stop, [stop]);
  return { start, stop };
}

function StepperButton({
  dir,
  label,
  onStep,
  size = 100,
}: {
  dir: 1 | -1;
  label: string;
  onStep: (dir: 1 | -1) => void;
  size?: number;
}) {
  const hold = useHoldRepeat(onStep);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    hold.start(dir);
  };

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      className={cn(
        "flex h-10 items-center justify-center rounded-[6px] text-muted-foreground transition-colors",
        "hover:bg-white/8 hover:text-foreground active:bg-white/12",
      )}
      style={{ width: size }}
      onPointerDown={onPointerDown}
      onPointerUp={hold.stop}
      onPointerCancel={hold.stop}
    >
      <Chevron dir={dir === 1 ? "up" : "down"} />
    </button>
  );
}

type ListOption = { value: number; label: string };

function rangeOptions(max: number, step: number): ListOption[] {
  const out: ListOption[] = [];
  for (let n = 0; n <= max; n += step) out.push({ value: n, label: pad(n) });
  return out;
}

const HOUR_OPTIONS = rangeOptions(23, 1);
const HOUR12_OPTIONS: ListOption[] = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => ({
  value: n,
  label: pad(n),
}));
const MINUTE_OPTIONS = rangeOptions(55, 5);
const PERIOD_OPTIONS: ListOption[] = [
  { value: 0, label: "AM" },
  { value: 1, label: "PM" },
];

function PickGrid({
  options,
  value,
  columns,
  onSelect,
}: {
  options: ListOption[];
  value: number;
  columns: number;
  onSelect: (value: number) => void;
}) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            tabIndex={-1}
            className={cn(
              "flex h-11 items-center justify-center rounded-md tabular-nums text-[15px] font-normal transition-colors",
              selected ? "bg-white/12 text-foreground" : "text-foreground hover:bg-white/8",
            )}
            onClick={() => onSelect(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Colon({ size }: { size: number }) {
  return (
    <span
      className="flex w-5 items-center justify-center select-none text-[40px] font-semibold leading-none text-muted-foreground"
      style={{ height: size }}
      aria-hidden
    >
      :
    </span>
  );
}

function StepperBoard({
  columns,
}: {
  columns: {
    key: string;
    label: string;
    value: string;
    active: boolean;
    wide?: boolean;
    onStep: (dir: 1 | -1) => void;
    onActivate: () => void;
    onPick: () => void;
  }[];
}) {
  const acc = useRef<Record<string, number>>({});
  // Fill the 300×220 body: 2 cols ≈ 100px; 3+ cols scale down to fit.
  const size = columns.length <= 2 ? 100 : columns.length === 3 ? 80 : 68;
  const fontSize = columns.length <= 2 ? 46 : columns.length === 3 ? 38 : 32;

  return (
    <div className="flex items-center">
      {columns.map((col, i) => (
        <Fragment key={col.key}>
          {i > 0 ? (
            <div className="flex flex-col items-center gap-1.5" aria-hidden>
              <div className="h-10" />
              <Colon size={size} />
              <div className="h-10" />
            </div>
          ) : null}
          <div
            role="group"
            aria-label={col.label}
            className="flex flex-col items-center gap-1.5"
            onPointerDown={col.onActivate}
            onWheel={(e) => {
              acc.current[col.key] = (acc.current[col.key] ?? 0) + e.deltaY;
              if (Math.abs(acc.current[col.key]) < 28) return;
              col.onStep(acc.current[col.key] > 0 ? -1 : 1);
              acc.current[col.key] = 0;
            }}
          >
            <StepperButton dir={1} label={`Increase ${col.label}`} onStep={col.onStep} size={size} />
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Choose ${col.label}`}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded-[6px] font-semibold leading-none tracking-tight transition-colors",
                col.wide ? "text-[26px]" : "tabular-nums",
                col.active ? "bg-white/10 text-foreground" : "text-foreground hover:bg-white/8",
              )}
              style={{ width: size, height: size, fontSize: col.wide ? undefined : fontSize }}
              onClick={col.onPick}
            >
              {col.value}
            </button>
            <StepperButton dir={-1} label={`Decrease ${col.label}`} onStep={col.onStep} size={size} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}

export const TimePicker = forwardRef<HTMLInputElement, TimePickerProps>(function TimePicker(
  {
    value,
    defaultValue,
    onChange,
    size,
    status,
    allowClear = true,
    format = "HH:mm",
    use12Hours = false,
    hourStep = 1,
    minuteStep = 1,
    secondStep = 1,
    placeholder = "Select time",
    disabled,
    className,
    style,
    popupClassName,
    placement = "right",
    id,
    name,
    autoFocus,
    onBlur,
    onFocus,
  },
  ref,
) {
  const app = useAppConfig();
  const showSeconds = format === "HH:mm:ss";
  const controlled = value !== undefined;
  const [inner, setInner] = useState<TimeValue | null>(() => parseTime(defaultValue));
  const selected = controlled ? parseTime(value) : inner;
  const selectedKey = selected ? formatValue(selected, true) : "";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => (selected ? formatDisplay(selected, showSeconds, use12Hours) : ""));
  const [focused, setFocused] = useState(false);
  const [activePart, setActivePart] = useState<Part>("h");
  const [picking, setPicking] = useState<Part | null>(null);
  const [fallback, setFallback] = useState<TimeValue>(nowParts);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const tok = getSizeTokens(size);
  const fieldStyle = controlFieldStyle(size);
  const { side, align } = placementToRadix(placement);

  useEffect(() => {
    if (focused) return;
    setText(selected ? formatDisplay(selected, showSeconds, use12Hours) : "");
  }, [selectedKey, focused, showSeconds, use12Hours, selected]);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    if (open && !selectedKey) setFallback(nowParts());
    if (!open) setPicking(null);
  }, [open, selectedKey]);

  const commit = useCallback(
    (next: TimeValue | null) => {
      if (!controlled) setInner(next);
      onChange?.(next ? formatValue(next, showSeconds) : null, next);
      setText(next ? formatDisplay(next, showSeconds, use12Hours) : "");
    },
    [controlled, onChange, showSeconds, use12Hours],
  );

  const wall = selected ?? fallback;

  const applyStep = (part: Part, dir: 1 | -1) => {
    if (disabled) return;
    const next: TimeValue = { ...wall };
    if (part === "h") {
      if (use12Hours) {
        const { hour, pm } = to12(next.hours);
        const stepped = stepWrap(hour === 12 ? 0 : hour, dir, 11, 1);
        const hour12 = stepped === 0 ? 12 : stepped;
        next.hours = from12(hour12, pm);
      } else {
        next.hours = stepWrap(next.hours, dir, 23, hourStep);
      }
    } else if (part === "m") {
      next.minutes = stepWrap(next.minutes, dir, 59, minuteStep);
    } else if (part === "s") {
      next.seconds = stepWrap(next.seconds, dir, 59, secondStep);
    } else {
      next.hours = (next.hours + 12) % 24;
    }
    setActivePart(part);
    commit(next);
  };

  const applyPartValue = (part: Part, n: number) => {
    if (disabled) return;
    const next: TimeValue = { ...wall };
    if (part === "h") {
      next.hours = use12Hours ? from12(n, to12(next.hours).pm) : n;
    } else if (part === "m") {
      next.minutes = n;
    } else if (part === "s") {
      next.seconds = n;
    } else {
      next.hours = from12(to12(next.hours).hour, n === 1);
    }
    setActivePart(part);
    commit(next);
    setPicking(null);
  };

  const togglePick = (part: Part) => {
    setActivePart(part);
    setPicking((p) => (p === part ? null : part));
  };

  const setRefs = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  const syncPartFromCaret = (el: HTMLInputElement) => {
    setActivePart(partFromCaret(el.selectionStart ?? 0, showSeconds, use12Hours));
  };

  const clear = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    commit(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      applyStep(activePart, 1);
      setOpen(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      applyStep(activePart, -1);
      setOpen(true);
    } else if (e.key === "Enter") {
      const parsed = parseTime(text);
      commit(parsed);
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      if (picking) {
        setPicking(null);
        return;
      }
      setText(selected ? formatDisplay(selected, showSeconds, use12Hours) : "");
      setOpen(false);
    }
  };

  const dismissLock = useRef(false);
  const dismissLockTimer = useRef(0);

  const openPicker = () => {
    if (disabled) return;
    dismissLock.current = true;
    window.clearTimeout(dismissLockTimer.current);
    dismissLockTimer.current = window.setTimeout(() => {
      dismissLock.current = false;
    }, 300);
    setOpen(true);
  };

  useEffect(() => () => window.clearTimeout(dismissLockTimer.current), []);

  const { hour: hour12, pm } = to12(wall.hours);

  const pickTitle = picking === "h" ? "Select hour" : picking === "m" ? "Select minute" : picking === "s" ? "Select second" : picking === "a" ? "Select period" : "Select time";
  const pickOptions = picking === "h" ? (use12Hours ? HOUR12_OPTIONS : HOUR_OPTIONS) : picking === "a" ? PERIOD_OPTIONS : picking === "m" || picking === "s" ? MINUTE_OPTIONS : null;
  const pickValue = picking === "h" ? (use12Hours ? hour12 : wall.hours) : picking === "m" ? wall.minutes : picking === "s" ? wall.seconds : picking === "a" ? (pm ? 1 : 0) : 0;
  const pickColumns = picking === "h" && !use12Hours ? 6 : picking === "a" ? 2 : 4;

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(v) => {
        if (disabled) return;
        if (!v && dismissLock.current) return;
        setOpen(v);
      }}
    >
      <PopoverPrimitive.Anchor asChild>
        <div
          ref={fieldRef}
          onPointerDown={() => openPicker()}
          className={cn(
            "group/timepicker inline-flex w-full cursor-pointer items-center gap-2 border border-solid border-input bg-[var(--control-bg,#212121)] text-foreground",
            controlFieldTransition,
            "focus-within:bg-[var(--control-bg-hover,#2a2a2a)]",
            open && "bg-[var(--control-bg-hover,#2a2a2a)]",
            controlStatusClass(status),
            disabled && "cursor-not-allowed opacity-45",
            className,
          )}
          style={{ ...fieldStyle, paddingRight: tok.paddingInlineIconEnd, ...style }}
        >
          <span className="inline-flex shrink-0 text-muted-foreground">
            <ClockIcon size={tok.icon} />
          </span>
          <input
            ref={setRefs}
            id={id}
            name={name}
            disabled={disabled}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            inputMode="numeric"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={placeholder}
            value={text}
            onChange={(e) => {
              const raw = e.target.value;
              setText(raw);
              const parsed = parseTime(raw);
              if (parsed) {
                if (!controlled) setInner(parsed);
                onChange?.(formatValue(parsed, showSeconds), parsed);
              }
            }}
            onFocus={(e) => {
              setFocused(true);
              openPicker();
              syncPartFromCaret(e.currentTarget);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              const parsed = parseTime(text);
              commit(parsed);
              onBlur?.(e);
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={(e) => syncPartFromCaret(e.currentTarget)}
            onClick={(e) => syncPartFromCaret(e.currentTarget)}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-foreground placeholder:text-quaternary-foreground outline-none disabled:cursor-not-allowed"
            style={{ fontSize: fieldStyle.fontSize, lineHeight: fieldStyle.lineHeight }}
          />
          {allowClear && selected && !disabled ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Clear"
              className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground group-hover/timepicker:opacity-100 group-focus-within/timepicker:opacity-100"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clear}
            >
              <ClearIcon />
            </button>
          ) : null}
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal container={app.getPopupContainer?.()}>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={10}
          alignOffset={0}
          arrowPadding={16}
          collisionPadding={10}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => {
            if (fieldRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          onFocusOutside={(e) => {
            if (fieldRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (fieldRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          className={cn(
            "z-[9999] w-[300px] rounded-lg border border-[var(--popper-border)] bg-popover p-0 text-popover-foreground shadow-[var(--popper-shadow)] outline-none nonla-popper",
            popupClassName,
          )}
        >
          <div className="overflow-hidden rounded-[inherit]">
            <div className="relative flex h-10 items-center justify-center border-b border-white/8 px-2">
              {picking ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Back"
                  className="absolute top-1/2 left-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-white/8 hover:text-foreground"
                  onClick={() => setPicking(null)}
                >
                  <Chevron dir="left" />
                </button>
              ) : null}
              <div className="text-[13px] font-medium text-foreground">{pickTitle}</div>
            </div>
            {picking && pickOptions ? (
              <div className="flex h-[220px] items-center p-3">
                <div className="w-full">
                  <PickGrid options={pickOptions} value={pickValue} columns={pickColumns} onSelect={(n) => applyPartValue(picking, n)} />
                </div>
              </div>
            ) : (
              <div className="flex h-[220px] flex-col items-center justify-center px-4">
                <StepperBoard
                  columns={[
                    {
                      key: "h",
                      label: "Hours",
                      value: pad(use12Hours ? hour12 : wall.hours),
                      active: activePart === "h",
                      onStep: (dir) => applyStep("h", dir),
                      onActivate: () => setActivePart("h"),
                      onPick: () => togglePick("h"),
                    },
                    {
                      key: "m",
                      label: "Minutes",
                      value: pad(wall.minutes),
                      active: activePart === "m",
                      onStep: (dir) => applyStep("m", dir),
                      onActivate: () => setActivePart("m"),
                      onPick: () => togglePick("m"),
                    },
                    ...(showSeconds
                      ? [
                          {
                            key: "s",
                            label: "Seconds",
                            value: pad(wall.seconds),
                            active: activePart === "s",
                            onStep: (dir: 1 | -1) => applyStep("s", dir),
                            onActivate: () => setActivePart("s"),
                            onPick: () => togglePick("s"),
                          },
                        ]
                      : []),
                    ...(use12Hours
                      ? [
                          {
                            key: "a",
                            label: "Period",
                            value: pm ? "PM" : "AM",
                            active: activePart === "a",
                            wide: true,
                            onStep: () => applyStep("a", 1),
                            onActivate: () => setActivePart("a"),
                            onPick: () => togglePick("a"),
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            )}
          </div>
          <PopoverPrimitive.Arrow width={12} height={7} className="fill-popover drop-shadow-[0_1px_0_var(--popper-border)]" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
});
