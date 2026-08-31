import { Input, Modal, message } from "antd";
import { useState } from "react";
import type { DatatableTable } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { datatablesApi } from "../common/datatablesApi";

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
      const table = edit ? await datatablesApi.updateTable(edit.id, trimmed) : await datatablesApi.createTable(projectId, trimmed);
      message.success(edit ? "Updated" : "Created");
      onSaved(table);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={edit ? "Rename table" : "New table"} onCancel={onClose} onOk={handleSubmit} confirmLoading={saving} okText={edit ? "Save" : "Create"} destroyOnHidden>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Table name" onPressEnter={handleSubmit} />
      <RenderIf condition={!!error}>
        <p className="mt-2 mb-0 text-sm text-destructive">{error}</p>
      </RenderIf>
    </Modal>
  );
}
