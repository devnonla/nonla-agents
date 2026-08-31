import { AddIcon } from "@solar-icons/react/dynamic/add";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { Button, Form, Input, Modal, message } from "antd";
import type { InputRef } from "antd";
import { useEffect, useRef, useState } from "react";
import { useAppDispatch } from "src/store/store";
import { createToolFolder, updateToolFolder } from "../common/toolFoldersSlice";
import type { ToolFolderWithTools } from "../common/toolFoldersSlice";

interface FolderDialogProps {
  open: boolean;
  onClose: () => void;
  folder?: ToolFolderWithTools | null;
}

export function FolderDialog({ open, onClose, folder }: FolderDialogProps) {
  const dispatch = useAppDispatch();
  const isEdit = !!folder;
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<InputRef>(null);

  useEffect(() => {
    if (open) {
      setName(folder?.name ?? "");
      setSaving(false);
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open, folder]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
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
      message.error(isEdit ? "Failed to update folder" : "Failed to create folder");
    } finally {
      setSaving(false);
    }
  };

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
          <Button type="text" size="small" onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" size="small" loading={saving} onClick={handleSubmit} disabled={!name.trim()}>
            {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create Folder"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-4">
        <Form.Item
          label={
            <span className="text-muted-foreground">
              Folder Name<span className="text-destructive"> *</span>
            </span>
          }
          className="mb-0!"
          layout="vertical"
        >
          <Input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="e.g. Integrations, Scrapers…"
            autoComplete="off"
          />
        </Form.Item>
      </div>
    </Modal>
  );
}
