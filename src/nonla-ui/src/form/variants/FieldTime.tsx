import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { TimePicker } from "../../timepicker/TimePicker";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
  options?: Record<string, unknown>;
  status?: "error" | "warning";
};

export function FieldTime({ field, options, status }: Props) {
  const opts = options ?? {};
  return (
    <TimePicker
      className="w-full"
      value={(field.value as string | Date | null) ?? null}
      onChange={(time) => field.onChange(time)}
      placeholder={(opts.placeholder as string) ?? "Select time"}
      status={status}
      format={opts.format as "HH:mm" | "HH:mm:ss" | undefined}
      use12Hours={opts.use12Hours as boolean | undefined}
      allowClear={opts.allowClear !== false}
      disabled={opts.disabled as boolean | undefined}
    />
  );
}
