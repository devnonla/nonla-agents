import type { ControllerRenderProps, FieldValues } from "react-hook-form";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
};

export function FieldHidden({ field }: Props) {
  return <input type="hidden" name={field.name} value={field.value == null ? "" : String(field.value)} onChange={field.onChange} ref={field.ref} />;
}
