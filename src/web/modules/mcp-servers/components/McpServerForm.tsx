import { Button, EFormItemType, Input, SchemaForm, type TFormItemProps, message } from "devnonla-ui";
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import type { McpServer } from "src/common/types";
import { useAppDispatch } from "src/store/store";
import { createMcpServer, updateMcpServer } from "../common/mcpServersSlice";

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
          <Input value={row.key} placeholder="Authorization" className="min-w-0 flex-1 bg-white/70 placeholder:text-muted-foreground" onChange={(e) => onChange(rows.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)))} />
          <Input.Password value={row.value} placeholder="Bearer …" className="min-w-0 flex-[1.4] bg-white/70 placeholder:text-muted-foreground" visibilityToggle={false} onChange={(e) => onChange(rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))} />
          <Button
            type="text"
            size="small"
            danger
            icon={<X size={14} />}
            onClick={() => {
              const next = rows.filter((_, i) => i !== index);
              onChange(next.length === 0 ? [newRow()] : next);
            }}
            aria-label="Remove header"
          />
        </div>
      ))}
      <Button type="default" size="small" icon={<Plus size={14} />} onClick={() => onChange([...rows, newRow()])} className="self-start bg-white/70">
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

export function McpServerForm({
  edit,
  onCancel,
  onSaved,
}: {
  edit?: McpServer | null;
  onCancel?: () => void;
  onSaved: (server: McpServer) => void;
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
        options: { placeholder: "my-server", autoFocus: true, className: "w-full bg-white/70 placeholder:text-muted-foreground" },
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
        options: { placeholder: "http://localhost:3000/mcp", className: "w-full bg-white/70 placeholder:text-muted-foreground" },
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
      const saved = isEdit && edit ? ((await dispatch(updateMcpServer({ id: edit.id, ...payload })).unwrap()) as McpServer) : ((await dispatch(createMcpServer(payload)).unwrap()) as McpServer);
      message.success(isEdit ? "Updated" : "Created");
      onSaved(saved);
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <p className="m-0 text-sm text-foreground/70">Connect over HTTP. Optional headers are used for auth.</p>
      <SchemaForm form={form} items={items} />
      {rootError ? <p className="m-0 text-sm text-destructive">{rootError}</p> : null}
      <div className="flex items-center gap-2">
        {onCancel ? (
          <Button type="default" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="primary" htmlType="submit" loading={saving}>
          {isEdit ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  );
}
