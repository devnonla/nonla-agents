import type { Control, ControllerRenderProps, FieldValues } from "react-hook-form";
import { useFieldArray } from "react-hook-form";
import { fieldNameOf } from "../common/rules";
import type { TFormItemProps } from "../common/types";
import { FieldRepeaterItem } from "./FieldRepeaterItem";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
  name: string | string[] | number[];
  control: Control<FieldValues>;
  childItems?: TFormItemProps[];
};

export function FieldRepeater({ name, control, childItems }: Props) {
  const arrayName = fieldNameOf(name);
  const { fields, append, remove } = useFieldArray({
    control,
    name: arrayName,
  });

  const handleAdd = () => {
    const defaults: Record<string, unknown> = {};
    for (const child of childItems ?? []) {
      const key = fieldNameOf(child.name);
      if (child.defaultValue !== undefined) {
        defaults[key] = child.defaultValue;
      }
    }
    append(defaults);
  };

  return (
    <div className="flex flex-col gap-5">
      {fields.map((item, index) => (
        <FieldRepeaterItem
          key={item.id}
          index={index}
          remove={remove}
          namePrefix={`${arrayName}.${index}`}
          childItems={childItems}
          control={control}
        />
      ))}

      <div className="relative flex flex-row items-center">
        <div className="h-px w-4 bg-border" />
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent py-0.5 pl-0.5 pr-2 text-xs text-foreground transition-colors hover:bg-brand hover:text-white"
        >
          <span className="inline-flex size-4 items-center justify-center rounded-[3px] bg-brand text-white">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 2.5V9.5M2.5 6H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          Add item
        </button>
      </div>
    </div>
  );
}
