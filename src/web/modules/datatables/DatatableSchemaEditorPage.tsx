import { Button, message } from "@nonla-agents/ui";
import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { AltArrowLeftIcon } from "@solar-icons/react/dynamic/alt-arrow-left";
import { DatabaseIcon } from "@solar-icons/react/dynamic/database";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "src/common/api";
import { SettingKey } from "src/common/enum";
import type { DatatableColumn, DatatableProject, DatatableTable } from "src/common/types";
import { getSettingValues } from "src/modules/settings/common/settingsApi";
import { datatablesApi } from "./common/datatablesApi";
import { DatatableAgentPanel } from "./components/DatatableAgentPanel";
import { SchemaPropertiesDialog } from "./components/SchemaPropertiesDialog";
import { TableDialog } from "./components/TableDialog";
import { type FlowNode, schemaNodeTypes } from "./components/schema-nodes";
import "@xyflow/react/dist/style.css";
import { Background, BackgroundVariant, ReactFlow, useNodesState } from "@xyflow/react";

const NODE_WIDTH = 260;
const GAP_X = 40;

function layoutTableNodes(tables: DatatableTable[], columnsMap: Record<string, DatatableColumn[]>, onEditProperties: (id: string) => void): FlowNode[] {
  if (tables.length === 0) return [];

  return tables.map((table, index) => {
    const cols = columnsMap[table.id] ?? [];

    return {
      id: table.id,
      type: "table",
      position: { x: index * (NODE_WIDTH + GAP_X), y: 0 },
      data: {
        label: table.name,
        columns: cols,
        onClick: () => onEditProperties(table.id),
        onEditProperties: () => onEditProperties(table.id),
      },
      draggable: true,
      dragHandle: ".table-drag-handle",
    };
  });
}

export default function DatatableSchemaEditorPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<DatatableProject | null>(null);
  const [tables, setTables] = useState<DatatableTable[]>([]);
  const [columnsMap, setColumnsMap] = useState<Record<string, DatatableColumn[]>>({});
  const [loading, setLoading] = useState(true);
  const [editPropertiesTableId, setEditPropertiesTableId] = useState<string | null>(null);
  const [tableDialog, setTableDialog] = useState<DatatableTable | "create" | null>(null);
  const [providerId, setProviderId] = useState<string | undefined>();
  const [model, setModel] = useState("");

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);

  const handleEditProperties = useCallback((id: string) => {
    setEditPropertiesTableId(id);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const schema = await datatablesApi.getProjectSchema(projectId);
      setProject(schema.project);
      setTables(schema.tables.map(({ columns: _columns, ...table }) => table));
      setColumnsMap(Object.fromEntries(schema.tables.map((t) => [t.id, t.columns])));
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const refreshSchema = useCallback(async () => {
    try {
      const schema = await datatablesApi.getProjectSchema(projectId);
      setProject(schema.project);
      setTables(schema.tables.map(({ columns: _columns, ...table }) => table));
      setColumnsMap(Object.fromEntries(schema.tables.map((t) => [t.id, t.columns])));
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void getSettingValues([SettingKey.DatatableAssistantProvider, SettingKey.DatatableAssistantModel]).then((s) => {
      setProviderId(s[SettingKey.DatatableAssistantProvider] || undefined);
      setModel(s[SettingKey.DatatableAssistantModel] ?? "");
    });
  }, []);

  useEffect(() => {
    if (loading) return;
    setNodes(layoutTableNodes(tables, columnsMap, handleEditProperties));
  }, [loading, tables, columnsMap, setNodes, handleEditProperties]);

  const editPropertiesTable = useMemo(() => tables.find((t) => t.id === editPropertiesTableId) ?? null, [tables, editPropertiesTableId]);
  const editPropertiesColumns = editPropertiesTableId ? (columnsMap[editPropertiesTableId] ?? []) : [];

  const handleTableCreated = useCallback((table: DatatableTable) => {
    setTables((prev) => [...prev, table].sort((a, b) => a.name.localeCompare(b.name)));
    setColumnsMap((prev) => ({ ...prev, [table.id]: [] }));
  }, []);

  const handleTableUpdated = useCallback((table: DatatableTable) => {
    setTables((prev) => prev.map((t) => (t.id === table.id ? table : t)).sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  const handleTableDeleted = useCallback((tableId: string) => {
    setTables((prev) => prev.filter((t) => t.id !== tableId));
    setColumnsMap((prev) => {
      const next = { ...prev };
      delete next[tableId];
      return next;
    });
  }, []);

  const handleTableSchemaSaved = useCallback((table: DatatableTable, columns: DatatableColumn[]) => {
    setTables((prev) => prev.map((t) => (t.id === table.id ? { ...t, ...table } : t)).sort((a, b) => a.name.localeCompare(b.name)));
    setColumnsMap((prev) => ({ ...prev, [table.id]: columns }));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading schema...</div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-4 py-3">
          <button type="button" onClick={() => navigate(`/datatables/${projectId}`)} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none" title="Back" aria-label="Back to project">
            <AltArrowLeftIcon size={16} />
          </button>
          <DatabaseIcon size={20} weight="BoldDuotone" className="shrink-0 text-brand-soft" />
          <h1 className="m-0 min-w-0 flex-1 truncate text-lg font-semibold text-foreground">{project?.name ?? "…"}</h1>
          <div className="ml-auto">
            <Button type="primary" icon={<AddCircleIcon size={16} />} onClick={() => setTableDialog("create")}>
              New table
            </Button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-background">
          {tables.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6">
              <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <DatabaseIcon size={24} weight="BoldDuotone" />
              </span>
              <p className="m-0 text-sm font-medium text-foreground">No tables yet</p>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">Create a table or ask the assistant</p>
              <Button type="primary" icon={<AddCircleIcon size={16} />} onClick={() => setTableDialog("create")}>
                New table
              </Button>
            </div>
          ) : (
            <ReactFlow nodes={nodes} onNodesChange={onNodesChange} nodeTypes={schemaNodeTypes} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.6} maxZoom={1.5} nodesConnectable={false} edgesFocusable={false} elementsSelectable proOptions={{ hideAttribution: true }} className="bg-transparent!">
              <Background variant={BackgroundVariant.Dots} gap={30} size={1.8} color="color-mix(in oklab, var(--color-foreground) 18%, transparent)" />
            </ReactFlow>
          )}
        </div>
      </div>

      <DatatableAgentPanel
        providerId={providerId}
        model={model}
        streamUrl={`/api/datatables/projects/${projectId}/agent/stream`}
        onSchemaChanged={() => void refreshSchema()}
        onModelChange={(pid, m) => {
          setProviderId(pid);
          setModel(m);
          void apiClient.patch("/api/settings", {
            [SettingKey.DatatableAssistantProvider]: pid,
            [SettingKey.DatatableAssistantModel]: m,
          });
        }}
      />

      {tableDialog ? (
        <TableDialog
          projectId={projectId}
          edit={tableDialog === "create" ? null : tableDialog}
          onClose={() => setTableDialog(null)}
          onSaved={(table) => {
            if (tableDialog === "create") handleTableCreated(table);
            else handleTableUpdated(table);
          }}
        />
      ) : null}

      {editPropertiesTableId ? (
        <SchemaPropertiesDialog
          tableId={editPropertiesTableId}
          tableName={editPropertiesTable?.name ?? ""}
          columns={editPropertiesColumns}
          onClose={() => setEditPropertiesTableId(null)}
          onSaved={(table, columns) => {
            setEditPropertiesTableId(null);
            handleTableSchemaSaved(table, columns);
          }}
          onDeleted={() => {
            const id = editPropertiesTableId;
            setEditPropertiesTableId(null);
            handleTableDeleted(id);
          }}
        />
      ) : null}
    </div>
  );
}
