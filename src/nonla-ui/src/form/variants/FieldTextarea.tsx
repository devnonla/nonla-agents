import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { Input } from "../../input/Input";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
  options?: Record<string, unknown>;
  status?: "error" | "warning";
};

export function FieldTextarea({ field, options, status }: Props) {
  const { value, onChange, onBlur, name, ref } = field;
  return (
    <Input.TextArea
      className="w-full"
      name={name}
      ref={ref as never}
      onBlur={onBlur}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      status={status}
      rows={4}
      {...(options as object)}
    />
  );
}
