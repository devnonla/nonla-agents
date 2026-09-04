import { Input, type InputProps } from "@nonla-agents/ui";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { type ChangeEvent, useEffect, useRef, useState } from "react";

const DEFAULT_WAIT = 300;

export type SearchInputProps = Omit<InputProps, "prefix" | "onChange" | "value" | "defaultValue"> & {
  defaultValue?: string;
  /** Debounced after typing stops for `wait` ms (trimmed). Clear and Enter flush immediately. */
  onChange?: (value: string) => void;
  /** Debounce delay in ms. Default 300. */
  wait?: number;
};

export function SearchInput({ defaultValue = "", onChange, wait = DEFAULT_WAIT, allowClear = true, className, placeholder = "Search…", onPressEnter, ...rest }: SearchInputProps) {
  const [value, setValue] = useState(defaultValue);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const flush = (raw: string) => {
    clearTimer();
    onChangeRef.current?.(raw.trim());
  };

  const schedule = (raw: string) => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onChangeRef.current?.(raw.trim());
    }, wait);
  };

  useEffect(() => clearTimer, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setValue(next);
    if (next === "") flush("");
    else schedule(next);
  };

  return (
    <Input
      {...rest}
      allowClear={allowClear}
      className={className}
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      prefix={<MagnifierIcon size={14} className="text-muted-foreground" />}
      onPressEnter={(e) => {
        flush(value);
        onPressEnter?.(e);
      }}
    />
  );
}
