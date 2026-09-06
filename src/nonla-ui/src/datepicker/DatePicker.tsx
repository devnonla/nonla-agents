import * as PopoverPrimitive from "@radix-ui/react-popover";
import { format as formatDate, isValid, parseISO } from "date-fns";
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ForwardRefExoticComponent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
  forwardRef,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "../calendar/Calendar";
import { Button } from "../button/Button";
import { cn } from "../lib/cn";
import { type ControlSize, controlFieldStyle, controlFieldTransition, controlStatusClass, getSizeTokens } from "../lib/sizes";

export type DatePickerProps = {
  value?: Date | string | null;
  defaultValue?: Date | string | null;
  onChange?: (date: Date | null, dateString: string) => void;
  size?: ControlSize;
  status?: "error" | "warning";
  allowClear?: boolean;
  format?: string;
  showTime?: boolean;
  /** Keep the panel open until OK (antd). */
  needConfirm?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  popupClassName?: string;
  autoFocus?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderExtraFooter?: () => ReactNode;
};

export type RangeValue = [Date | null, Date | null] | null;

export type RangePickerProps = {
  value?: RangeValue;
  defaultValue?: RangeValue;
  onChange?: (dates: RangeValue, dateStrings: [string, string]) => void;
  size?: ControlSize;
  status?: "error" | "warning";
  allowClear?: boolean;
  format?: string;
  placeholder?: [string, string] | string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  popupClassName?: string;
  /** Show two months side by side (default true). */
  numberOfMonths?: number;
  separator?: string;
};

function parseValue(value: Date | string | null | undefined): Date | undefined {
  if (value == null || value === "") return undefined;
  if (value instanceof Date) return isValid(value) ? value : undefined;
  const iso = parseISO(value);
  if (isValid(iso)) return iso;
  const d = new Date(value);
  return isValid(d) ? d : undefined;
}

function toDateString(date: Date | null | undefined, showTime?: boolean, fmt?: string): string {
  if (!date || !isValid(date)) return "";
  if (fmt) return formatDate(date, fmt);
  return formatDate(date, showTime ? "MMM d, yyyy HH:mm" : "MMM d, yyyy");
}

function parseRange(value: RangeValue | undefined): DateRange | undefined {
  if (!value) return undefined;
  const from = parseValue(value[0]);
  const to = parseValue(value[1]);
  if (!from && !to) return undefined;
  return { from, to };
}

function rangeToValue(range: DateRange | undefined): RangeValue {
  if (!range?.from && !range?.to) return null;
  return [range?.from ?? null, range?.to ?? null];
}

function CalendarIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 opacity-55">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 10H21" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 3V7M16 3V7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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

function mergeDateTime(base: Date, hours: number, minutes: number): Date {
  const next = new Date(base);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

const TriggerChrome = forwardRef<
  HTMLButtonElement,
  {
    size?: ControlSize;
    status?: "error" | "warning";
    disabled?: boolean;
    className?: string;
    style?: CSSProperties;
    icon: ReactElement;
    clear?: ReactElement | null;
    children: ReactNode;
  } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "style">
>(function TriggerChrome({ size, status, disabled, className, style, icon, clear, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={cn(
        "group/datepicker inline-flex w-full cursor-pointer items-center gap-2 border border-solid border-input bg-[var(--control-bg)] text-left text-foreground",
        controlFieldTransition,
        "focus:bg-[var(--control-bg-hover)] data-[state=open]:bg-[var(--control-bg-hover)]",
        "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45",
        controlStatusClass(status),
        className,
      )}
      style={{ ...controlFieldStyle(size), ...style }}
      {...rest}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {clear}
    </button>
  );
});

const DatePickerRoot = forwardRef<HTMLButtonElement, DatePickerProps>(function DatePicker(
  {
    value,
    defaultValue,
    onChange,
    size,
    status,
    allowClear = true,
    format,
    showTime,
    needConfirm,
    placeholder = "Pick a date",
    disabled,
    className,
    style,
    popupClassName,
    autoFocus,
    open: openProp,
    onOpenChange,
    renderExtraFooter,
  },
  ref,
) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState<Date | undefined>(() => parseValue(defaultValue));
  const selected = controlled ? parseValue(value) : inner;
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setInnerOpen(v);
    onOpenChange?.(v);
  };
  const [month, setMonth] = useState<Date>(() => selected ?? new Date());
  const [draft, setDraft] = useState<Date | undefined>(selected);
  const tok = getSizeTokens(size);
  const confirm = Boolean(needConfirm);

  useEffect(() => {
    if (autoFocus) {
      // focus trigger after mount
      const id = window.requestAnimationFrame(() => (ref as React.RefObject<HTMLButtonElement> | null)?.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
  }, [autoFocus, ref]);

  useEffect(() => {
    if (selected) setMonth(selected);
  }, [selected?.getTime()]);

  useEffect(() => {
    if (open) setDraft(selected);
  }, [open, selected?.getTime()]);

  const panelDate = confirm ? draft : selected;
  const label = useMemo(() => toDateString(selected, showTime, format), [selected, showTime, format]);

  const commit = (next: Date | null) => {
    if (!controlled) setInner(next ?? undefined);
    onChange?.(next, toDateString(next, showTime, format));
  };

  const onSelect = (day: Date | undefined) => {
    if (!day) {
      if (confirm) setDraft(undefined);
      else commit(null);
      return;
    }
    const base = confirm ? draft ?? selected : selected;
    const withTime = showTime && base ? mergeDateTime(day, base.getHours(), base.getMinutes()) : day;
    if (confirm) {
      setDraft(withTime);
      return;
    }
    commit(withTime);
    if (!showTime) setOpen(false);
  };

  const onTimeChange = (part: "h" | "m", raw: string) => {
    const base = confirm ? draft ?? selected : selected;
    if (!base) return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const hours = part === "h" ? Math.min(23, Math.max(0, n)) : base.getHours();
    const minutes = part === "m" ? Math.min(59, Math.max(0, n)) : base.getMinutes();
    const next = mergeDateTime(base, hours, minutes);
    if (confirm) setDraft(next);
    else commit(next);
  };

  const clear = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    commit(null);
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverPrimitive.Trigger asChild>
        <TriggerChrome
          ref={ref}
          size={size}
          status={status}
          disabled={disabled}
          className={className}
          style={style}
          icon={<CalendarIcon size={tok.icon} />}
          clear={
            allowClear && selected && !disabled ? (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear"
                className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground group-hover/datepicker:opacity-100"
                onClick={clear}
                onPointerDown={(e) => e.preventDefault()}
              >
                <ClearIcon />
              </span>
            ) : null
          }
        >
          <span className={cn(!selected && "text-quaternary-foreground")}>{selected ? label : placeholder}</span>
        </TriggerChrome>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className={cn(
            "z-[9999] w-auto overflow-hidden rounded-lg border border-[var(--popper-border)] bg-popover p-3 text-popover-foreground shadow-[var(--popper-shadow)] outline-none nonla-popper",
            popupClassName,
          )}
        >
          {renderExtraFooter?.()}
          <Calendar mode="single" selected={panelDate} onSelect={onSelect} month={month} onMonthChange={setMonth} />
          {showTime ? (
            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">Time</span>
              <TimeField value={panelDate ? pad(panelDate.getHours()) : "00"} disabled={!panelDate} onChange={(v) => onTimeChange("h", v)} max={23} />
              <span className="text-muted-foreground">:</span>
              <TimeField value={panelDate ? pad(panelDate.getMinutes()) : "00"} disabled={!panelDate} onChange={(v) => onTimeChange("m", v)} max={59} />
            </div>
          ) : null}
          {confirm ? (
            <div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
              <Button
                size="small"
                onClick={() => {
                  setDraft(selected);
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="small"
                type="primary"
                disabled={!draft}
                onClick={() => {
                  commit(draft ?? null);
                  setOpen(false);
                }}
              >
                OK
              </Button>
            </div>
          ) : null}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
});

const RangePicker = forwardRef<HTMLButtonElement, RangePickerProps>(function RangePicker(
  {
    value,
    defaultValue,
    onChange,
    size,
    status,
    allowClear = true,
    format,
    placeholder = ["Start date", "End date"],
    disabled,
    className,
    style,
    popupClassName,
    numberOfMonths = 2,
    separator = "–",
  },
  ref,
) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState<DateRange | undefined>(() => parseRange(defaultValue));
  const selected = controlled ? parseRange(value) : inner;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => selected?.from ?? new Date());
  const tok = getSizeTokens(size);

  useEffect(() => {
    if (selected?.from) setMonth(selected.from);
  }, [selected?.from?.getTime()]);

  const placeholders = Array.isArray(placeholder) ? placeholder : [placeholder, placeholder];
  const startLabel = toDateString(selected?.from, false, format);
  const rangeComplete = Boolean(
    selected?.from && selected?.to && selected.from.getTime() !== selected.to.getTime(),
  );
  const endLabel = rangeComplete ? toDateString(selected?.to, false, format) : "";
  const hasValue = Boolean(selected?.from || selected?.to);

  const commit = (next: DateRange | undefined) => {
    if (!controlled) setInner(next);
    const dates = rangeToValue(next);
    onChange?.(dates, [toDateString(dates?.[0], false, format), toDateString(dates?.[1], false, format)]);
  };

  const onSelect = (range: DateRange | undefined) => {
    commit(range);
    // DayPicker sets from===to on the first click; close only once the range has a real end.
    if (range?.from && range?.to && range.from.getTime() !== range.to.getTime()) {
      setOpen(false);
    }
  };

  const clear = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    commit(undefined);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverPrimitive.Trigger asChild>
        <TriggerChrome
          ref={ref}
          size={size}
          status={status}
          disabled={disabled}
          className={className}
          style={style}
          icon={<CalendarIcon size={tok.icon} />}
          clear={
            allowClear && hasValue && !disabled ? (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear"
                className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground group-hover/datepicker:opacity-100"
                onClick={clear}
                onPointerDown={(e) => e.preventDefault()}
              >
                <ClearIcon />
              </span>
            ) : null
          }
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className={cn("truncate", !selected?.from && "text-quaternary-foreground")}>{selected?.from ? startLabel : placeholders[0]}</span>
            <span className="shrink-0 text-muted-foreground">{separator}</span>
            <span className={cn("truncate", !rangeComplete && "text-quaternary-foreground")}>{rangeComplete ? endLabel : placeholders[1]}</span>
          </span>
        </TriggerChrome>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className={cn(
            "z-[9999] w-auto overflow-hidden rounded-lg border border-[var(--popper-border)] bg-popover p-3 text-popover-foreground shadow-[var(--popper-shadow)] outline-none nonla-popper",
            popupClassName,
          )}
        >
          <Calendar
            mode="range"
            selected={selected}
            onSelect={onSelect}
            month={month}
            onMonthChange={setMonth}
            numberOfMonths={numberOfMonths}
            defaultMonth={selected?.from}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
});

function TimeField({
  value,
  onChange,
  disabled,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  max: number;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 w-12 rounded-md border border-solid border-input bg-[var(--control-bg)] px-1.5 text-center text-sm text-foreground",
        "focus-visible:outline-none disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
      )}
    />
  );
}

type DatePickerComponent = ForwardRefExoticComponent<DatePickerProps & RefAttributes<HTMLButtonElement>> & {
  RangePicker: typeof RangePicker;
};

export const DatePicker = DatePickerRoot as DatePickerComponent;
DatePicker.RangePicker = RangePicker;

export { RangePicker };
