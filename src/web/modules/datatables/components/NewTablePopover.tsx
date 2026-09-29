import { Button, EFormItemType, Popover, SchemaForm, type TFormItemProps, message } from "devnonla-ui";
import { type ReactNode, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { DatatableTable } from "src/common/types";
import { datatablesApi } from "../common/datatablesApi";

type TableValues = { name: string };

const ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "name",
    label: "Name",
    colSpan: 12,
    rules: {
      required: "Name is required",
      validate: (value) => (typeof value === "string" && value.trim() ? true : "Name is required"),
    },
    options: { placeholder: "Table name", autoFocus: true },
  },
];

export function NewTablePopover({ projectId, onSaved, children }: { projectId: string; onSaved: (table: DatatableTable) => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<TableValues>({ defaultValues: { name: "" }, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  useEffect(() => {
    if (!open) return;
    form.reset({ name: "" });
    setSaving(false);
    const t = window.setTimeout(() => form.setFocus("name"), 150);
    return () => window.clearTimeout(t);
  }, [open, form]);

  const onSubmit = form.handleSubmit(async ({ name }) => {
    setSaving(true);
    try {
      const table = await datatablesApi.createTable(projectId, name.trim());
      message.success("Created");
      setOpen(false);
      onSaved(table);
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      arrow
      contentClassName="w-72 max-w-none p-0"
      content={
        <form className="flex flex-col gap-3 p-4" onSubmit={onSubmit}>
          <p className="m-0 text-sm font-medium text-foreground">New table</p>
          <SchemaForm form={form} items={ITEMS} />
          {rootError ? <div className="text-xs leading-snug text-destructive">{rootError}</div> : null}
          <div className="flex justify-end gap-2">
            <Button type="text" size="medium" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="primary" size="medium" htmlType="submit" loading={saving}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      }
    >
      {children}
    </Popover>
  );
}
