import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { InputNumber } from "../../input/Input";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
  options?: Record<string, unknown>;
  status?: "error" | "warning";
};

export function FieldNumber({ field, options, status }: Props) {
  const { value, onChange, onBlur, name, ref } = field;
  const opts = options ?? {};
  return (
    <InputNumber
      className="w-full"
      name={name}
      ref={ref}
      onBlur={onBlur}
      value={value == null || value === "" ? null : Number(value)}
      onChange={(v) => onChange(v)}
      status={status}
      min={opts.min as number | undefined}
      max={opts.max as number | undefined}
      step={opts.step as number | undefined}
      {...(opts as object)}
    />
  );
}
