import { Input, Modal, message } from "antd";
import { useState } from "react";
import type { DatatableProject } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { datatablesApi } from "../common/datatablesApi";

export function ProjectDialog({ edit, onClose, onSaved }: { edit?: DatatableProject | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(edit?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={edit ? "Rename project" : "New project"} onCancel={onClose} onOk={handleSubmit} confirmLoading={saving} okText={edit ? "Save" : "Create"} destroyOnHidden>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" onPressEnter={handleSubmit} />
      <RenderIf condition={!!error}>
        <p className="mt-2 mb-0 text-sm text-destructive">{error}</p>
      </RenderIf>
    </Modal>
  );
}
