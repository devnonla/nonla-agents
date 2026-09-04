import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { DatePicker } from "../../datepicker/DatePicker";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
  options?: Record<string, unknown>;
  status?: "error" | "warning";
};

export function FieldDateTime({ field, options, status }: Props) {
  const opts = options ?? {};
  return (
    <DatePicker
      className="w-full"
      value={(field.value as Date | string | null) ?? null}
      onChange={(date) => field.onChange(date)}
      placeholder={(opts.placeholder as string) ?? "Select date"}
      status={status}
      showTime={opts.showTime as boolean | undefined}
      format={opts.format as string | undefined}
      allowClear={opts.allowClear !== false}
      disabled={opts.disabled as boolean | undefined}
    />
  );
}
