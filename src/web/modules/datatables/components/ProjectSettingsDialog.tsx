import { Button, EFormItemType, Modal, Popconfirm, SchemaForm, type TFormItemProps, message } from "@nonla-agents/ui";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import type { DatatableProject } from "src/common/types";
import { datatablesApi } from "../common/datatablesApi";

type SettingsValues = { name: string };

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

export function ProjectSettingsDialog({
  project,
  onClose,
  onUpdated,
}: {
  project: DatatableProject;
  onClose: () => void;
  onUpdated: (project: DatatableProject) => void;
}) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const form = useForm<SettingsValues>({ defaultValues: { name: project.name }, mode: "onSubmit" });
  const name = form.watch("name");
  const dirty = name.trim() !== project.name;
  const canSave = dirty && name.trim().length > 0;

  useEffect(() => {
    form.reset({ name: project.name });
  }, [project.name, form]);

  const onSubmit = form.handleSubmit(async ({ name: nextName }) => {
    const trimmed = nextName.trim();
    if (!canSave) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const updated = await datatablesApi.updateProject(project.id, trimmed);
      onUpdated(updated);
      message.success("Saved");
      onClose();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await datatablesApi.deleteProject(project.id);
      message.success("Deleted");
      navigate("/datatables");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  };

  return (
    <Modal open title="Project settings" onCancel={onClose} onOk={() => void onSubmit()} confirmLoading={saving} okText="Save" okButtonProps={{ disabled: deleting || !canSave }} cancelButtonProps={{ disabled: saving || deleting }} destroyOnHidden>
      <form onSubmit={onSubmit}>
        <SchemaForm form={form} items={ITEMS} />
      </form>

      <div className="mt-2 border-t border-border-subtle pt-4">
        <p className="m-0 text-[11px] font-medium text-muted-foreground">Danger zone</p>
        <p className="mb-3 mt-1 text-xs text-tertiary-foreground">Permanently delete this project and all of its tables and rows.</p>
        <Popconfirm title={`Delete "${project.name}"?`} description="All tables and rows in this project will be deleted." okText="Delete" okType="danger" cancelText="Cancel" onConfirm={() => void handleDelete()}>
          <Button size="small" danger loading={deleting} disabled={saving} icon={<TrashBinMinimalisticIcon size={14} />}>
            Delete project
          </Button>
        </Popconfirm>
      </div>
    </Modal>
  );
}
