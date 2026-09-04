import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { cn } from "../../lib/cn";
import type { ISelectItemProps } from "../common/types";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
  choices?: ISelectItemProps[];
};

export function FieldRadio({ field, choices }: Props) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup">
      {(choices ?? []).map((option) => {
        const id = `${field.name}-${option.value}`;
        const checked = String(field.value) === String(option.value);
        return (
          <label key={String(option.value)} htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              id={id}
              type="radio"
              name={field.name}
              value={String(option.value)}
              checked={checked}
              onChange={() => field.onChange(option.value)}
              onBlur={field.onBlur}
              className={cn("size-4 cursor-pointer accent-[var(--brand)]")}
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
