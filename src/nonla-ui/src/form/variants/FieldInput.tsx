import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { Input } from "../../input/Input";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
  options?: Record<string, unknown>;
  status?: "error" | "warning";
};

export function FieldInput({ field, options, status }: Props) {
  const { value, onChange, onBlur, name, ref } = field;
  return (
    <Input
      className="w-full"
      name={name}
      ref={ref}
      onBlur={onBlur}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      status={status}
      {...(options as object)}
    />
  );
}
