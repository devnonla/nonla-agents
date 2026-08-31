import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { Button, Form, Input, Modal, Popconfirm, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DatatableProject } from "src/common/types";
import { datatablesApi } from "../common/datatablesApi";

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
  const [name, setName] = useState(project.name);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setName(project.name);
  }, [project.name]);

  const dirty = name.trim() !== project.name;
  const canSave = dirty && name.trim().length > 0;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      message.error("Name is required");
      return;
    }
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
  };

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
    <Modal open title="Project settings" onCancel={onClose} onOk={() => void handleSave()} confirmLoading={saving} okText="Save" okButtonProps={{ disabled: deleting || !canSave }} cancelButtonProps={{ disabled: saving || deleting }} destroyOnHidden>
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" onPressEnter={() => void handleSave()} autoFocus />
        </Form.Item>
      </Form>

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
