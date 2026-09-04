import { useState } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { Input } from "../../input/Input";
import { Popover } from "../../popover/Popover";

type Props = {
  field: ControllerRenderProps<FieldValues, string>;
  options?: Record<string, unknown>;
  status?: "error" | "warning";
};

const FALLBACK = "#000000";

export function FieldColor({ field, options, status }: Props) {
  const raw = typeof field.value === "string" ? field.value : field.value ? String(field.value) : "";
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : FALLBACK;
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="bottom"
        content={
          <div className="flex flex-col gap-2 p-1 min-w-[180px]">
            <input
              type="color"
              value={hex}
              onChange={(e) => field.onChange(e.target.value)}
              className="h-24 w-full cursor-pointer border-0 bg-transparent p-0"
              aria-label="Pick color"
            />
            <Input
              value={raw || hex}
              onChange={(e) => field.onChange(e.target.value)}
              placeholder="#000000"
              status={status}
              className="font-mono text-sm"
              {...(options as object)}
            />
          </div>
        }
      >
        <button
          type="button"
          className="size-9 shrink-0 cursor-pointer rounded border border-input p-0"
          style={{ backgroundColor: raw || hex }}
          aria-label="Color picker"
        />
      </Popover>
      <Input
        className="flex-1 font-mono text-sm"
        value={raw}
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={field.onBlur}
        placeholder="#000000"
        status={status}
      />
    </div>
  );
}
