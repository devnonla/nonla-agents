import { Button, EFormItemType, Input, Modal, SchemaForm, type TFormItemProps, message } from "@nonla-agents/ui";
import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import type { McpServer } from "src/common/types";
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

function HeaderRowsEditor({ value, onChange }: { value: HeaderRow[]; onChange: (rows: HeaderRow[]) => void }) {
  const rows = value.length > 0 ? value : [newRow()];
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-center gap-2">
          <Input value={row.key} placeholder="Authorization" className="min-w-0 flex-1" onChange={(e) => onChange(rows.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)))} />
          <Input.Password value={row.value} placeholder="Bearer …" className="min-w-0 flex-[1.4]" visibilityToggle={false} onChange={(e) => onChange(rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))} />
          <Button
            type="text"
            size="small"
            danger
            icon={<TrashBinMinimalisticIcon size={14} />}
            onClick={() => {
              const next = rows.filter((_, i) => i !== index);
              onChange(next.length === 0 ? [newRow()] : next);
            }}
            aria-label="Remove header"
          />
        </div>
      ))}
      <Button type="dashed" size="small" icon={<AddCircleIcon size={14} />} onClick={() => onChange([...rows, newRow()])} className="self-start">
        Add header
      </Button>
    </div>
  );
}

type McpValues = {
  name: string;
  url: string;
  headers: HeaderRow[];
};

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
  const form = useForm<McpValues>({
    defaultValues: { name: edit?.name ?? "", url: edit?.url ?? "", headers: headersToRows(edit?.headers) },
    mode: "onSubmit",
  });
  const rootError = form.formState.errors.root?.message;

  const items: TFormItemProps[] = useMemo(
    () => [
      {
        type: EFormItemType.Input,
        name: "name",
        label: "Name",
        colSpan: 12,
        rules: {
          required: "Name is required",
          validate: (value) => (typeof value === "string" && value.trim() ? true : "Name is required"),
        },
        options: { placeholder: "my-server", autoFocus: true },
      },
      {
        type: EFormItemType.Input,
        name: "url",
        label: "URL",
        colSpan: 12,
        rules: {
          required: "URL is required",
          validate: (value) => (typeof value === "string" && value.trim() ? true : "URL is required"),
        },
        options: { placeholder: "https://example.com/mcp" },
      },
      {
        type: EFormItemType.Custom,
        name: "headers",
        label: "Headers",
        colSpan: 12,
        render: ({ field }) => <HeaderRowsEditor value={(field.value as HeaderRow[]) ?? [newRow()]} onChange={field.onChange} />,
      },
    ],
    [],
  );

  const onSubmit = form.handleSubmit(async ({ name, url, headers }) => {
    setSaving(true);
    try {
      const payload = { name: name.trim(), url: url.trim(), headers: rowsToHeaders(headers) };
      if (isEdit && edit) {
        await dispatch(updateMcpServer({ id: edit.id, ...payload })).unwrap();
        message.success("Updated");
      } else {
        await dispatch(createMcpServer(payload)).unwrap();
        message.success("Created");
      }
      await dispatch(fetchMcpServers());
      onClose();
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal open title={isEdit ? "Edit MCP server" : "Add MCP server"} onCancel={onClose} onOk={() => void onSubmit()} okText={isEdit ? "Save" : "Add"} confirmLoading={saving} destroyOnHidden width={520}>
      <p className="mb-3 text-sm text-muted-foreground">Connect a remote MCP endpoint over HTTP. Optional headers are used for auth.</p>
      <form onSubmit={onSubmit}>
        <SchemaForm form={form} items={items} />
        {rootError ? <p className="mb-0 text-sm text-destructive">{rootError}</p> : null}
      </form>
    </Modal>
  );
}
