import { EFormItemType, Modal, SchemaForm, type TFormItemProps, message } from "@nonla-agents/ui";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { DatatableProject } from "src/common/types";
import { datatablesApi } from "../common/datatablesApi";

type ProjectValues = { name: string };

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
    options: { placeholder: "Project name", autoFocus: true },
  },
];

export function ProjectDialog({ edit, onClose, onSaved }: { edit?: DatatableProject | null; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const form = useForm<ProjectValues>({ defaultValues: { name: edit?.name ?? "" }, mode: "onSubmit" });
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
      if (edit) {
        await datatablesApi.updateProject(edit.id, trimmed);
        message.success("Updated");
      } else {
        await datatablesApi.createProject(trimmed);
        message.success("Created");
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal open title={edit ? "Rename project" : "New project"} onCancel={onClose} onOk={() => void onSubmit()} confirmLoading={saving} okText={edit ? "Save" : "Create"} destroyOnHidden>
      <form onSubmit={onSubmit}>
        <SchemaForm form={form} items={ITEMS} />
        {rootError ? <p className="mb-0 text-sm text-destructive">{rootError}</p> : null}
      </form>
    </Modal>
  );
}
