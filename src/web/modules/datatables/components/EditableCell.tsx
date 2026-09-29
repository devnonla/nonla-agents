import { DatePicker, Dropdown, EditableInput, message } from "devnonla-ui";
import type { MenuProps } from "devnonla-ui";
import { useEffect, useRef, useState } from "react";
import { cn } from "src/common/lib/cn";
import type { DatatableColumn } from "src/common/types";
import { DATETIME_PICKER_FORMAT, fromPickerDate, toPickerDate } from "src/common/utils/date";
import { cellValuesEqual, draftToValue, valueToDraft } from "../common/cellValueUtils";
import { formatCellValue } from "../common/columnUtils";
import { NumberStepper } from "./NumberStepper";
import { SelectPill } from "./SelectPill";

export function EditableCell({
  col,
  value,
  editing,
  timeZone,
  onStartEdit,
  onCommit,
  onCancel,
  tryCellAction,
}: {
  col: DatatableColumn;
  value: unknown;
  editing: boolean;
  timeZone: string;
  onStartEdit: () => void;
  onCommit: (next: unknown) => void | Promise<void>;
  onCancel: () => void;
  tryCellAction: () => boolean;
}) {
  const [selectOpen, setSelectOpen] = useState(false);
  const committedRef = useRef(false);

  useEffect(() => {
    if (!editing || (col.type !== "datetime" && col.type !== "number")) return;
    committedRef.current = false;
  }, [editing, col.type, col.id]);

  const finish = (next: unknown) => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (cellValuesEqual(value, next)) {
      onCancel();
      return;
    }
    onCommit(next);
  };

  if (col.type === "boolean") {
    return (
      <button
        type="button"
        className="flex h-9 w-full min-w-0 cursor-pointer items-center justify-center border-0 border-r border-border-subtle bg-transparent px-2.5 transition-colors hover:bg-muted/40"
        onClick={() => {
          if (!tryCellAction()) return;
          onCommit(!value);
        }}
      >
        <span className="inline-flex items-center justify-center leading-none">{formatCellValue(col, value, timeZone)}</span>
      </button>
    );
  }

  if (col.type === "select") {
    const items: MenuProps["items"] = [
      ...(col.options ?? []).map((opt) => ({
        key: opt,
        label: <SelectPill value={opt} />,
        onClick: () => onCommit(opt),
      })),
      ...(col.options?.length ? [{ type: "divider" as const }] : []),
      {
        key: "__clear",
        label: <span className="text-muted-foreground">Clear</span>,
        onClick: () => onCommit(null),
      },
    ];
    return (
      <Dropdown
        menu={{ items }}
        trigger={["click"]}
        open={selectOpen}
        placement="bottomLeft"
        destroyOnHidden
        classNames={{ root: "dt-select-dropdown" }}
        onOpenChange={(open) => {
          if (open && !tryCellAction()) return;
          setSelectOpen(open);
        }}
      >
        <button type="button" className="flex h-9 w-full min-w-0 cursor-pointer items-center border-0 border-r border-border-subtle bg-transparent px-2 text-left text-sm transition-colors hover:bg-muted/40">
          <span className="inline-flex max-w-full min-w-0">{formatCellValue(col, value, timeZone)}</span>
        </button>
      </Dropdown>
    );
  }

  if (col.type === "datetime" && editing) {
    return (
      <div className="relative z-30 flex h-9 min-w-0 items-center border-r border-border-subtle">
        <DatePicker
          showTime
          allowClear={false}
          autoFocus
          open
          needConfirm
          value={toPickerDate(typeof value === "string" ? value : null, timeZone)}
          format={DATETIME_PICKER_FORMAT}
          className="absolute left-0 top-0 z-30 h-9! w-[calc(100%+20px)] min-w-[calc(100%+20px)] rounded-md! border-transparent! bg-muted! shadow-panel!"
          renderExtraFooter={() =>
            value == null || value === "" ? null : (
              <button
                type="button"
                className="w-full cursor-pointer border-0 bg-transparent py-1 text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
                onMouseDown={(e) => {
                  // Prevent picker from treating this as outside-click cancel.
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => finish(null)}
              >
                Clear
              </button>
            )
          }
          onChange={(d) => finish(fromPickerDate(d, timeZone))}
          onOpenChange={(open) => {
            if (!open && !committedRef.current) {
              committedRef.current = true;
              onCancel();
            }
          }}
        />
      </div>
    );
  }

  if (col.type === "number" && editing) {
    return (
      <div className="relative z-30 h-9 min-w-0 border-r border-border-subtle">
        <NumberStepper
          value={value}
          autoFocus
          className="absolute left-0 top-0 z-30 h-9! w-[calc(100%+20px)] min-w-[calc(100%+20px)]"
          onCommit={(next) => finish(next)}
          onCancel={() => {
            committedRef.current = true;
            onCancel();
          }}
        />
      </div>
    );
  }

  if (col.type === "text" || col.type === "json") {
    return (
      <div
        className="flex h-9 min-w-0 cursor-pointer items-center border-r border-border-subtle px-2 transition-colors hover:bg-muted/40"
        onClick={() => {
          if (editing || !tryCellAction()) return;
          onStartEdit();
        }}
      >
        <EditableInput
          display={formatCellValue(col, value, timeZone)}
          editing={editing}
          onStartEdit={() => {
            if (!tryCellAction()) return;
            onStartEdit();
          }}
          onCancelEdit={onCancel}
          initialValue={valueToDraft(col, value)}
          placeholder={col.name}
          type={col.type === "json" ? "textarea" : "text"}
          editLabel={`Edit ${col.name}`}
          minWidth={col.type === "json" ? 320 : 240}
          allowEmpty
          onSave={async (draft) => {
            if (col.type === "json" && draft.trim()) {
              try {
                JSON.parse(draft);
              } catch {
                message.error("Invalid JSON");
                throw new Error("Invalid JSON");
              }
            }
            const next = draftToValue(col, draft);
            if (cellValuesEqual(value, next)) return;
            await onCommit(next);
          }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="flex h-9 w-full min-w-0 cursor-pointer items-center border-0 border-r border-border-subtle bg-transparent px-2 text-left text-sm transition-colors hover:bg-muted/40"
      onClick={() => {
        if (!tryCellAction()) return;
        onStartEdit();
      }}
    >
      <span className={cn("min-w-0", col.type === "datetime" ? "whitespace-nowrap" : "truncate")}>{formatCellValue(col, value, timeZone)}</span>
    </button>
  );
}
