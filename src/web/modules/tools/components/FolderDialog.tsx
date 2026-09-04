import { Button, EFormItemType, Modal, SchemaForm, type TFormItemProps, message } from "@nonla-agents/ui";
import { AddIcon } from "@solar-icons/react/dynamic/add";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useAppDispatch } from "src/store/store";
import { createToolFolder, updateToolFolder } from "../common/toolFoldersSlice";
import type { ToolFolderWithTools } from "../common/toolFoldersSlice";

interface FolderDialogProps {
  open: boolean;
  onClose: () => void;
  folder?: ToolFolderWithTools | null;
}

type FolderValues = {
  name: string;
};

const ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "name",
    label: "Folder Name",
    colSpan: 12,
    rules: {
      required: "Please enter a folder name",
      validate: (value) => (typeof value === "string" && value.trim() ? true : "Please enter a folder name"),
    },
    options: { placeholder: "e.g. Integrations, Scrapers…", autoComplete: "off" },
  },
];

export function FolderDialog({ open, onClose, folder }: FolderDialogProps) {
  const dispatch = useAppDispatch();
  const isEdit = !!folder;
  const [saving, setSaving] = useState(false);
  const form = useForm<FolderValues>({ defaultValues: { name: "" }, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  useEffect(() => {
    if (!open) return;
    form.reset({ name: folder?.name ?? "" });
    setSaving(false);
    const t = window.setTimeout(() => form.setFocus("name"), 150);
    return () => window.clearTimeout(t);
  }, [open, folder, form]);

  const onSubmit = form.handleSubmit(async ({ name }) => {
    setSaving(true);
    try {
      if (isEdit && folder) {
        await dispatch(updateToolFolder({ id: folder.id, name: name.trim() })).unwrap();
        message.success("Folder updated");
      } else {
        await dispatch(createToolFolder({ name: name.trim() })).unwrap();
        message.success("Folder created");
      }
      onClose();
    } catch {
      form.setError("root", { message: isEdit ? "Failed to update folder" : "Failed to create folder" });
    } finally {
      setSaving(false);
    }
  });

  const icon = isEdit ? <PenNewSquareIcon size={16} /> : <AddIcon size={16} />;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-field-sm w-field-sm shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <div className="text-[14px] leading-none text-muted-foreground">{icon}</div>
          </div>
          <span className="truncate font-semibold text-foreground">{isEdit ? "Edit Folder" : "New Folder"}</span>
        </div>
      }
      width={420}
      centered
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2.5">
          <Button type="text" size="medium" onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" size="medium" htmlType="submit" form="folder-form" loading={saving}>
            {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create Folder"}
          </Button>
        </div>
      }
    >
      <form id="folder-form" className="pt-4" onSubmit={onSubmit}>
        <SchemaForm form={form} items={ITEMS} />
        {rootError ? <div className="mt-4 pl-2.75 text-xs leading-snug text-destructive">{rootError}</div> : null}
      </form>
    </Modal>
  );
}
