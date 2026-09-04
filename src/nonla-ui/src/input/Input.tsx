import {
  type CSSProperties,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../lib/cn";
import { type ControlSize, controlFieldStyle, controlFieldTransition, controlStatusClass, getSizeTokens } from "../lib/sizes";

export type InputSize = ControlSize;

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> & {
  size?: InputSize;
  status?: "error" | "warning";
  prefix?: ReactNode;
  suffix?: ReactNode;
  allowClear?: boolean;
  variant?: "outlined" | "borderless" | "filled";
  /** antd — fires on Enter (ignored while composing). */
  onPressEnter?: (e: KeyboardEvent<HTMLInputElement>) => void;
};

const fieldBase =
  "w-full border border-solid border-input bg-[var(--control-bg,#212121)] text-foreground placeholder:text-quaternary-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 focus:bg-[var(--control-bg-hover,#2a2a2a)]";

function variantClass(variant: InputProps["variant"]) {
  if (variant === "borderless") return "border-transparent bg-transparent hover:bg-transparent shadow-none";
  if (variant === "filled") return "border-transparent bg-muted";
  return "";
}

const InputRoot = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, size, status, prefix, suffix, allowClear, variant = "outlined", disabled, value, onChange, onPressEnter, onKeyDown, style, ...rest },
  ref,
) {
  const fieldStyle = controlFieldStyle(size);
  const showClear = allowClear && !disabled && value != null && String(value).length > 0;
  const wrapped = Boolean(prefix || suffix || showClear);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.key === "Enter" && !e.nativeEvent.isComposing) onPressEnter?.(e);
  };

  const input = (
    <input
      ref={ref}
      disabled={disabled}
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      className={cn(fieldBase, controlFieldTransition, controlStatusClass(status), variantClass(variant), wrapped && "border-0 bg-transparent h-full focus:bg-transparent p-0!", !wrapped && className)}
      style={wrapped ? { height: "100%", fontSize: fieldStyle.fontSize, lineHeight: fieldStyle.lineHeight, ...style } : { ...fieldStyle, ...style }}
      {...rest}
    />
  );

  if (!wrapped) return input;

  return (
    <div
      className={cn(
        "inline-flex w-full items-center gap-2 border border-solid border-input bg-[var(--control-bg,#212121)]",
        controlFieldTransition,
        controlStatusClass(status),
        variantClass(variant),
        "focus-within:outline-none focus-within:bg-[var(--control-bg-hover,#2a2a2a)]",
        disabled && "opacity-45 cursor-not-allowed",
        className,
      )}
      style={fieldStyle}
    >
      {prefix ? <span className="shrink-0 text-muted-foreground inline-flex items-center">{prefix}</span> : null}
      {input}
      {showClear ? (
        <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground text-xs leading-none" aria-label="Clear" onClick={() => onChange?.({ target: { value: "" } } as never)}>
          ×
        </button>
      ) : null}
      {suffix ? <span className="shrink-0 text-muted-foreground inline-flex items-center">{suffix}</span> : null}
    </div>
  );
});

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  status?: "error" | "warning";
  variant?: "outlined" | "borderless" | "filled";
  autoSize?: boolean | { minRows?: number; maxRows?: number };
  size?: ControlSize;
};

/** antd-compatible ref used by chat InputArea (`resizableTextArea.textArea`). */
export type TextAreaRef = HTMLTextAreaElement & {
  resizableTextArea?: { textArea: HTMLTextAreaElement };
};

const TextArea = forwardRef<TextAreaRef, TextAreaProps>(function TextArea(
  { className, status, variant = "outlined", autoSize, rows, style, size, onChange, value, ...rest },
  ref,
) {
  const tok = getSizeTokens(size);
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const minRows = typeof autoSize === "object" ? (autoSize.minRows ?? 1) : autoSize ? 1 : undefined;
  const maxRows = typeof autoSize === "object" ? autoSize.maxRows : undefined;
  const padY = 16;

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el || !autoSize) return;
    const minH = (minRows ?? 1) * tok.lineHeight + padY;
    const maxH = maxRows != null ? maxRows * tok.lineHeight + padY : Number.POSITIVE_INFINITY;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, minH), maxH);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
  }, [autoSize, minRows, maxRows, tok.lineHeight]);

  useLayoutEffect(() => {
    resize();
  }, [resize, value]);

  useImperativeHandle(ref, () => {
    const el = innerRef.current as TextAreaRef;
    if (el) el.resizableTextArea = { textArea: el };
    return el;
  });

  return (
    <textarea
      ref={innerRef}
      rows={rows ?? minRows ?? 3}
      value={value}
      onChange={(e) => {
        onChange?.(e);
        requestAnimationFrame(resize);
      }}
      className={cn(fieldBase, "py-2", autoSize ? "resize-none" : "resize-y", controlStatusClass(status), variantClass(variant), className)}
      style={
        {
          minHeight: autoSize ? (minRows ?? 1) * tok.lineHeight + padY : tok.height,
          fontSize: tok.fontSize,
          lineHeight: `${tok.lineHeight}px`,
          paddingLeft: tok.paddingInline,
          paddingRight: tok.paddingInline,
          borderRadius: tok.radius,
          ...style,
          ...(maxRows && !autoSize ? { maxHeight: maxRows * tok.lineHeight + padY } : null),
        } satisfies CSSProperties
      }
      {...rest}
    />
  );
});

export type InputNumberProps = Omit<InputProps, "type" | "onChange" | "value" | "defaultValue" | "prefix" | "suffix" | "allowClear" | "variant"> & {
  value?: number | null;
  defaultValue?: number;
  onChange?: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Show antd-style up/down handlers (default true). */
  controls?: boolean;
  /** Precision after decimal; omit to keep free typing. */
  precision?: number;
  parser?: (displayValue: string) => number;
  formatter?: (value: number | string | undefined) => string;
};

function clamp(n: number, min?: number, max?: number) {
  let v = n;
  if (min != null && v < min) v = min;
  if (max != null && v > max) v = max;
  return v;
}

function roundTo(n: number, precision?: number) {
  if (precision == null) return n;
  const f = 10 ** precision;
  return Math.round(n * f) / f;
}

function HandlerChevron({ dir }: { dir: "up" | "down" }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden className="opacity-70">
      {dir === "up" ? (
        <path d="M2.5 6.25L5 3.75L7.5 6.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

const InputNumber = forwardRef<HTMLInputElement, InputNumberProps>(function InputNumber(
  {
    value,
    defaultValue,
    onChange,
    min,
    max,
    step = 1,
    controls = true,
    precision,
    parser,
    formatter,
    disabled,
    size,
    status,
    className,
    style,
    placeholder,
    onBlur,
    onFocus,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState<number | null>(defaultValue ?? null);
  const numeric = controlled ? (value ?? null) : inner;
  const [text, setText] = useState(() => (numeric == null ? "" : String(numeric)));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const tok = getSizeTokens(size);
  const fieldStyle = controlFieldStyle(size);

  // Sync display from external value when not editing
  useEffect(() => {
    if (focused) return;
    if (numeric == null) setText("");
    else setText(formatter ? formatter(numeric) : String(numeric));
  }, [numeric, focused, formatter]);

  const commit = useCallback(
    (next: number | null) => {
      let v = next;
      if (v != null && Number.isFinite(v)) {
        v = roundTo(clamp(v, min, max), precision);
      } else {
        v = null;
      }
      if (!controlled) setInner(v);
      onChange?.(v);
      setText(v == null ? "" : formatter ? formatter(v) : String(v));
    },
    [controlled, onChange, min, max, precision, formatter],
  );

  const stepBy = (dir: 1 | -1) => {
    if (disabled) return;
    const base = numeric ?? min ?? 0;
    commit(base + dir * step);
    inputRef.current?.focus();
  };

  const parseRaw = (raw: string): number | null => {
    if (raw.trim() === "") return null;
    const n = parser ? parser(raw) : Number(raw.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const atMin = numeric != null && min != null && numeric <= min;
  const atMax = numeric != null && max != null && numeric >= max;
  const handlerW = tok.height <= 24 ? 18 : 22;

  const setRefs = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLInputElement | null }).current = node;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      stepBy(1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      stepBy(-1);
    }
    onKeyDown?.(e);
  };

  return (
    <div
      className={cn(
        "group relative inline-flex w-full items-stretch border border-solid border-input bg-[var(--control-bg,#212121)]",
        controlFieldTransition,
        "focus-within:bg-[var(--control-bg-hover,#2a2a2a)]",
        controlStatusClass(status),
        disabled && "opacity-45 cursor-not-allowed",
        className,
      )}
      style={{ height: fieldStyle.height, borderRadius: fieldStyle.borderRadius, ...style }}
    >
      <input
        {...rest}
        ref={setRefs}
        type="text"
        inputMode="decimal"
        role="spinbutton"
        aria-valuenow={numeric ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          // Live update when parseable (antd-like); keep typing free otherwise
          if (raw === "" || raw === "-" || raw === "." || raw === "-.") return;
          const n = parseRaw(raw);
          if (n != null) {
            if (!controlled) setInner(n);
            onChange?.(n);
          }
        }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(parseRaw(text));
          onBlur?.(e);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "min-w-0 flex-1 border-0 bg-transparent text-foreground placeholder:text-quaternary-foreground outline-none",
          "disabled:cursor-not-allowed",
          // Kill native number chrome if type ever switches
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        )}
        style={{
          height: "100%",
          fontSize: fieldStyle.fontSize,
          lineHeight: fieldStyle.lineHeight,
          paddingLeft: tok.paddingInline,
          paddingRight: controls ? handlerW + 4 : tok.paddingInline,
        }}
      />

      {controls && !disabled ? (
        <div
          className={cn(
            "absolute top-0 right-0 bottom-0 flex flex-col overflow-hidden border-l border-border/80",
            "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
          style={{ width: handlerW, borderTopRightRadius: tok.radius - 1, borderBottomRightRadius: tok.radius - 1 }}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label="Increase"
            disabled={atMax}
            className={cn(
              "flex flex-1 items-center justify-center text-muted-foreground",
              "hover:bg-white/8 hover:text-foreground active:bg-white/12",
              "disabled:opacity-30 disabled:pointer-events-none",
              "border-b border-border/60",
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => stepBy(1)}
          >
            <HandlerChevron dir="up" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Decrease"
            disabled={atMin}
            className={cn(
              "flex flex-1 items-center justify-center text-muted-foreground",
              "hover:bg-white/8 hover:text-foreground active:bg-white/12",
              "disabled:opacity-30 disabled:pointer-events-none",
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => stepBy(-1)}
          >
            <HandlerChevron dir="down" />
          </button>
        </div>
      ) : null}
    </div>
  );
});

export type PasswordProps = InputProps & {
  visibilityToggle?: boolean | { visible?: boolean; onVisibleChange?: (visible: boolean) => void };
};

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
      {off ? <path d="M4 4L20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /> : null}
    </svg>
  );
}

const Password = forwardRef<HTMLInputElement, PasswordProps>(function Password(
  { visibilityToggle = true, suffix, ...props },
  ref,
) {
  const toggle = visibilityToggle;
  const enabled = toggle !== false;
  const controlled = typeof toggle === "object" && toggle.visible !== undefined;
  const [inner, setInner] = useState(false);
  const visible = enabled && (controlled ? Boolean((toggle as { visible?: boolean }).visible) : inner);

  const setVisible = (v: boolean) => {
    if (!controlled) setInner(v);
    if (typeof toggle === "object") toggle.onVisibleChange?.(v);
  };

  const eye = enabled ? (
    <button
      type="button"
      tabIndex={-1}
      aria-label={visible ? "Hide password" : "Show password"}
      className="inline-flex items-center text-muted-foreground hover:text-foreground"
      onClick={() => setVisible(!visible)}
    >
      <EyeIcon off={!visible} />
    </button>
  ) : null;

  const mergedSuffix = suffix || eye ? <>{suffix}{eye}</> : undefined;

  return <InputRoot ref={ref} type={visible ? "text" : "password"} suffix={mergedSuffix} {...props} />;
});

export const Input = Object.assign(InputRoot, {
  TextArea,
  Password,
});

export { TextArea, InputNumber };
