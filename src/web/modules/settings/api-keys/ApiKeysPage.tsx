import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { DocumentTextIcon } from "@solar-icons/react/dynamic/document-text";
import { LockPasswordIcon } from "@solar-icons/react/dynamic/lock-password";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { Button, Popconfirm, Table, Tag, Tooltip, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import type { AgentListItem, ApiKey, DatatableProject, KvStoreEntry } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { ApiKeyFormDialog } from "./ApiKeyFormDialog";
import { CreatedKeyDialog } from "./CreatedKeyDialog";

function scopeLabel(unrestricted: boolean, count: number, singular: string, plural: string): string | null {
  if (unrestricted) return `All ${plural}`;
  if (count <= 0) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}

function AccessTags({ row }: { row: ApiKey }) {
  const tags = [scopeLabel(row.agentsUnrestricted, row.agentIds.length, "agent", "agents"), scopeLabel(row.datatablesUnrestricted, (row.datatableProjectIds ?? []).length, "datatable", "datatables"), scopeLabel(row.kvUnrestricted, (row.kvEntryIds ?? []).length, "KV key", "KV keys")].filter(
    (label): label is string => !!label,
  );

  if (tags.length === 0) return <span className="text-xs text-muted-foreground">None</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((label) => (
        <Tag key={label} className="m-0">
          {label}
        </Tag>
      ))}
    </div>
  );
}

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [datatableProjects, setDatatableProjects] = useState<DatatableProject[]>([]);
  const [kvEntries, setKvEntries] = useState<KvStoreEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editKey, setEditKey] = useState<ApiKey | null>(null);
  const [created, setCreated] = useState<ApiKey | null>(null);
  const [docsKey, setDocsKey] = useState<ApiKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keyResult, agentResult, projectResult, kvResult] = await Promise.all([
        apiClient.get<{ items: ApiKey[] }>("/api/api-keys"),
        apiClient.get<{ items: AgentListItem[] }>("/api/agents", { page: 1, limit: 200, sorts: "name" }),
        apiClient.get<DatatableProject[]>("/api/datatables/projects"),
        apiClient.get<{ items: KvStoreEntry[] }>("/api/kvstore", { sorts: "key" }),
      ]);
      setKeys(keyResult.items);
      setAgents(agentResult.items);
      setDatatableProjects(projectResult);
      setKvEntries(kvResult.items);
    } catch {
      message.error("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const withoutSecret = (row: ApiKey): ApiKey => ({ ...row, key: undefined });

  const handleCreated = (key: ApiKey) => {
    setKeys((prev) => [withoutSecret(key), ...prev]);
    setShowCreate(false);
    setCreated(key);
  };

  const handleUpdated = (key: ApiKey) => {
    setKeys((prev) => prev.map((item) => (item.id === key.id ? { ...item, ...key, key: undefined } : item)));
    setEditKey(null);
    message.success("Updated");
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/api/api-keys/${id}`);
      setKeys((prev) => prev.filter((item) => item.id !== id));
      message.success("Deleted");
    } catch {
      message.error("Failed to delete");
    }
  };

  const columns: ColumnsType<ApiKey> = [
    {
      title: "Name",
      key: "name",
      render: (_, row) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{row.name}</div>
          <div className="truncate font-mono text-[11px] text-tertiary-foreground">{row.keyPrefix}…</div>
        </div>
      ),
    },
    {
      title: "Permissions",
      key: "access",
      render: (_, row) => <AccessTags row={row} />,
    },
    {
      title: "",
      key: "actions",
      width: 116,
      align: "right",
      render: (_, row) => (
        <div className="flex items-center justify-end gap-0.5">
          <Tooltip title="LLM Docs">
            <Button type="text" size="small" icon={<DocumentTextIcon />} onClick={() => setDocsKey(withoutSecret(row))} aria-label={`LLM Docs for ${row.name}`} className="inline-flex items-center justify-center size-7! px-0!" />
          </Tooltip>
          <Button type="text" size="small" icon={<PenNewSquareIcon />} onClick={() => setEditKey(row)} aria-label={`Edit ${row.name}`} className="inline-flex items-center justify-center size-7! px-0!" />
          <Popconfirm title="Delete this key?" okText="Delete" okType="danger" onConfirm={() => void handleDelete(row.id)}>
            <Button type="text" size="small" icon={<TrashBinMinimalisticIcon />} aria-label={`Delete ${row.name}`} className="inline-flex items-center justify-center size-7! px-0!" />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-muted-foreground">
          {keys.length} key{keys.length !== 1 ? "s" : ""}
        </p>
        <Button type="primary" icon={<AddCircleIcon size={14} />} onClick={() => setShowCreate(true)}>
          New API key
        </Button>
      </div>

      <Table<ApiKey>
        rowKey="id"
        columns={columns}
        dataSource={keys}
        loading={loading}
        pagination={false}
        locale={{
          emptyText: (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                <LockPasswordIcon size={20} />
              </div>
              <div>
                <div className="text-base font-medium text-foreground">No API keys yet</div>
                <div className="mt-1 text-sm text-muted-foreground">Create a key to access agents, datatables, and KV over HTTP.</div>
              </div>
              <Button type="primary" size="small" icon={<AddCircleIcon size={12} />} onClick={() => setShowCreate(true)}>
                New API key
              </Button>
            </div>
          ),
        }}
      />

      <RenderIf condition={showCreate}>
        <ApiKeyFormDialog agents={agents} datatableProjects={datatableProjects} kvEntries={kvEntries} onClose={() => setShowCreate(false)} onCreated={handleCreated} onUpdated={handleUpdated} />
      </RenderIf>
      <RenderIf condition={!!editKey}>
        <ApiKeyFormDialog edit={editKey} agents={agents} datatableProjects={datatableProjects} kvEntries={kvEntries} onClose={() => setEditKey(null)} onCreated={handleCreated} onUpdated={handleUpdated} />
      </RenderIf>
      <RenderIf condition={!!created?.key}>
        <CreatedKeyDialog created={created!} agents={agents} datatableProjects={datatableProjects} kvEntries={kvEntries} onClose={() => setCreated(null)} />
      </RenderIf>
      <RenderIf condition={!!docsKey}>
        <CreatedKeyDialog created={docsKey!} agents={agents} datatableProjects={datatableProjects} kvEntries={kvEntries} onClose={() => setDocsKey(null)} />
      </RenderIf>
    </div>
  );
}
