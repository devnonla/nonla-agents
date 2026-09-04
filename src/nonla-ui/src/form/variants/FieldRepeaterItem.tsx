import { useState } from "react";
import type { Control, FieldValues } from "react-hook-form";
import { fieldNameOf } from "../common/rules";
import type { TFormItemProps } from "../common/types";
import { FormItem } from "../FormItem";

type Props = {
  index: number;
  remove: (index: number) => void;
  namePrefix: string;
  childItems?: TFormItemProps[];
  control: Control<FieldValues>;
};

export function FieldRepeaterItem({ index, remove, namePrefix, childItems, control }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="relative">
      <div className={`absolute bottom-0 left-0 border-l border-dashed border-border ${index === 0 ? "top-0" : "top-[-20px]"}`} />

      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2">
          <div className="h-px w-4 bg-border" />
          <button
            type="button"
            aria-label={collapsed ? "Expand item" : "Collapse item"}
            className="inline-flex size-4 items-center justify-center rounded-[3px] border-0 bg-muted text-muted-foreground cursor-pointer p-0"
            onClick={() => setCollapsed((v) => !v)}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden className={collapsed ? "-rotate-90" : undefined}>
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <span className="text-sm font-medium text-foreground">{`Item ${index + 1}`}</span>
        </div>
        <button
          type="button"
          aria-label="Remove item"
          className="inline-flex size-5 items-center justify-center rounded border-0 bg-muted text-muted-foreground cursor-pointer hover:bg-destructive hover:text-white"
          onClick={() => remove(index)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className={`mt-2 grid grid-cols-12 gap-x-4 overflow-hidden pl-8 ${collapsed ? "max-h-0" : ""}`}>
        {(childItems ?? []).map((child, childIndex) => {
          const childName = fieldNameOf(child.name);
          return (
            <FormItem
              key={`${namePrefix}.${childName}-${childIndex}`}
              {...child}
              name={`${namePrefix}.${childName}`}
              control={control}
            />
          );
        })}
      </div>
    </div>
  );
}
