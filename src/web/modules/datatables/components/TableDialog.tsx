import { EFormItemType, Modal, SchemaForm, type TFormItemProps, message } from "@nonla-agents/ui";
import { useEffect, useState } from "react";
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

export function TableDialog({
  projectId,
  edit,
  onClose,
  onSaved,
}: {
  projectId: string;
  edit?: DatatableTable | null;
  onClose: () => void;
  onSaved: (table: DatatableTable) => void;
}) {
  const [saving, setSaving] = useState(false);
  const form = useForm<TableValues>({ defaultValues: { name: edit?.name ?? "" }, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  useEffect(() => {
    form.reset({ name: edit?.name ?? "" });
    const t = window.setTimeout(() => form.setFocus("name"), 150);
    return () => window.clearTimeout(t);
  }, [edit, form]);

  const onSubmit = form.handleSubmit(async ({ name }) => {
    const trimmed = name.trim();
    setSaving(true);
    try {
      const table = edit ? await datatablesApi.updateTable(edit.id, trimmed) : await datatablesApi.createTable(projectId, trimmed);
      message.success(edit ? "Updated" : "Created");
      onSaved(table);
      onClose();
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal open title={edit ? "Rename table" : "New table"} onCancel={onClose} onOk={() => void onSubmit()} confirmLoading={saving} okText={edit ? "Save" : "Create"} destroyOnHidden>
      <form onSubmit={onSubmit}>
        <SchemaForm form={form} items={ITEMS} />
        {rootError ? <p className="mb-0 text-sm text-destructive">{rootError}</p> : null}
      </form>
    </Modal>
  );
}
