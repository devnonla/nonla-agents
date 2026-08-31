import { Alert, Form, Input, Modal, message } from "antd";
import { useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import type { AgentTool, MyMcpServer, ToolFolder } from "src/common/types";
import { RawButton } from "src/components/RawButton";
import RenderIf from "src/components/RenderIf";
import { fetchToolFolders } from "src/modules/tools/common/toolFoldersSlice";
import { fetchTools } from "src/modules/tools/common/toolsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { toMyMcpServerListItem, updateMyMcpServer, upsertMyMcpServerLocal } from "../common/myMcpServersSlice";
import { CustomToolPicker } from "./CustomToolPicker";

export function MyMcpServerDialog({
  edit,
  onClose,
  onCreated,
}: {
  edit?: MyMcpServer | null;
  onClose: () => void;
  onCreated: (server: MyMcpServer) => void;
}) {
  const dispatch = useAppDispatch();
  const tools = useAppSelector((s) => s.tools.items) as AgentTool[];
  const folders = useAppSelector((s) => s.toolFolders.folders) as ToolFolder[];
  const isEdit = !!edit;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(edit?.name ?? "");
  const [description, setDescription] = useState(edit?.description ?? "");
  const [toolIds, setToolIds] = useState<string[]>(edit?.tools?.map((t) => t.id) ?? []);

  useEffect(() => {
    dispatch(fetchTools());
    dispatch(fetchToolFolders());
  }, [dispatch]);

  useEffect(() => {
    if (!isEdit || !edit?.id) return;
    if (edit.tools) {
      setToolIds(edit.tools.map((t) => t.id));
      return;
    }
    void apiClient.get<MyMcpServer>(`/api/my-mcp-servers/${edit.id}`).then((detail) => {
      setToolIds(detail.tools?.map((t) => t.id) ?? []);
    });
  }, [isEdit, edit]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit && edit) {
        const updated = await dispatch(updateMyMcpServer({ id: edit.id, name: trimmedName, description: description.trim() || null, toolIds })).unwrap();
        dispatch(upsertMyMcpServerLocal(toMyMcpServerListItem(updated as MyMcpServer)));
        message.success("Updated");
        onClose();
      } else {
        const created = await apiClient.post<MyMcpServer>("/api/my-mcp-servers", {
          name: trimmedName,
          description: description.trim() || null,
          toolIds,
        });
        dispatch(upsertMyMcpServerLocal(toMyMcpServerListItem(created)));
        message.success("Created");
        onCreated(created);
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={isEdit ? "Edit MCP server" : "New MCP server"}
      onCancel={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <RawButton onClick={onClose}>Cancel</RawButton>
          <RawButton type="primary" loading={saving} onClick={() => void handleSubmit()}>
            {isEdit ? "Save" : "Create"}
          </RawButton>
        </div>
      }
      destroyOnHidden
      width={520}
    >
      <RenderIf condition={!!error}>
        <Alert type="error" description={error} showIcon className="mb-3" />
      </RenderIf>
      <p className="mb-3 text-sm text-muted-foreground">Pick custom tools to expose. Cursor and Claude Code will see their live schemas.</p>
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input autoFocus value={name} placeholder="my-tools" onChange={(e) => setName(e.target.value)} />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea value={description} placeholder="Optional" rows={2} onChange={(e) => setDescription(e.target.value)} />
        </Form.Item>
        <Form.Item label="Tools">
          <CustomToolPicker tools={tools} folders={folders} selectedIds={toolIds} onChange={setToolIds} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
