import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { Alert, Button, Form, Input, Modal, message } from "antd";
import { useState } from "react";
import type { McpServer } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch } from "src/store/store";
import { createMcpServer, fetchMcpServers, updateMcpServer } from "../common/mcpServersSlice";

type HeaderRow = { id: string; key: string; value: string };

function newRow(key = "", value = ""): HeaderRow {
  return { id: crypto.randomUUID(), key, value };
}

function headersToRows(headers: Record<string, string> | null | undefined): HeaderRow[] {
  const entries = Object.entries(headers ?? {});
  if (entries.length === 0) return [newRow()];
  return entries.map(([key, value]) => newRow(key, value));
}

function rowsToHeaders(rows: HeaderRow[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    headers[key] = row.value;
  }
  return headers;
}

export function McpServerDialog({
  edit,
  onClose,
}: {
  edit?: McpServer | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const isEdit = !!edit;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(edit?.name ?? "");
  const [url, setUrl] = useState(edit?.url ?? "");
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>(() => headersToRows(edit?.headers));

  const updateRow = (index: number, patch: Partial<HeaderRow>) => {
    setHeaderRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    setHeaderRows((rows) => [...rows, newRow()]);
  };

  const removeRow = (index: number) => {
    setHeaderRows((rows) => {
      const next = rows.filter((_, i) => i !== index);
      return next.length === 0 ? [newRow()] : next;
    });
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }
    if (!trimmedUrl) {
      setError("URL is required");
      return;
    }

    const headers = rowsToHeaders(headerRows);
    setSaving(true);
    setError("");
    try {
      if (isEdit && edit) {
        await dispatch(updateMcpServer({ id: edit.id, name: trimmedName, url: trimmedUrl, headers })).unwrap();
        message.success("Updated");
      } else {
        await dispatch(createMcpServer({ name: trimmedName, url: trimmedUrl, headers })).unwrap();
        message.success("Created");
      }
      await dispatch(fetchMcpServers());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={isEdit ? "Edit MCP server" : "Add MCP server"} onCancel={onClose} onOk={handleSubmit} okText={isEdit ? "Save" : "Add"} confirmLoading={saving} destroyOnHidden width={520}>
      <RenderIf condition={!!error}>
        <Alert type="error" description={error} showIcon className="mb-3" />
      </RenderIf>
      <p className="mb-3 text-sm text-muted-foreground">Connect a remote MCP endpoint over HTTP. Optional headers are used for auth.</p>
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input autoFocus value={name} placeholder="my-server" onChange={(e) => setName(e.target.value)} />
        </Form.Item>
        <Form.Item label="URL" required>
          <Input value={url} placeholder="https://example.com/mcp" onChange={(e) => setUrl(e.target.value)} />
        </Form.Item>
        <Form.Item label="Headers">
          <div className="flex flex-col gap-2">
            {headerRows.map((row, index) => (
              <div key={row.id} className="flex items-center gap-2">
                <Input value={row.key} placeholder="Authorization" className="min-w-0 flex-1" onChange={(e) => updateRow(index, { key: e.target.value })} />
                <Input.Password value={row.value} placeholder="Bearer …" className="min-w-0 flex-[1.4]" visibilityToggle={false} onChange={(e) => updateRow(index, { value: e.target.value })} />
                <Button type="text" size="small" danger icon={<TrashBinMinimalisticIcon size={14} />} onClick={() => removeRow(index)} aria-label="Remove header" />
              </div>
            ))}
            <Button type="dashed" size="small" icon={<AddCircleIcon size={14} />} onClick={addRow} className="self-start">
              Add header
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
}
