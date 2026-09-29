import { Button, FluentIcon, message } from "devnonla-ui";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { DatatableColumn, DatatableProject, DatatableTable } from "src/common/types";
import { AgentSidePanel } from "src/components/AgentSidePanel";
import { datatablesApi } from "./common/datatablesApi";
import { DatatableAgentPanel } from "./components/DatatableAgentPanel";
import { DatatableProjectHeader } from "./components/DatatableProjectHeader";
import { NewTablePopover } from "./components/NewTablePopover";
import { ProjectSettingsDialog } from "./components/ProjectSettingsDialog";
import { SchemaPropertiesDialog } from "./components/SchemaPropertiesDialog";
import { TableRowsPanel } from "./components/TableRowsPanel";
import { TableTabBar } from "./components/TableTabBar";

function sortTablesByName(tables: DatatableTable[]) {
  return [...tables].sort((a, b) => a.name.localeCompare(b.name));
}

export default function DatatableProjectPage() {
  const { projectId = "" } = useParams();
  const [project, setProject] = useState<DatatableProject | null>(null);
  const [tables, setTables] = useState<DatatableTable[]>([]);
  const [columnsMap, setColumnsMap] = useState<Record<string, DatatableColumn[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(true);
  const [editTableOpen, setEditTableOpen] = useState(false);

  const sortedTables = useMemo(() => sortTablesByName(tables), [tables]);
  const selectedTable = useMemo(() => sortedTables.find((t) => t.id === selectedTableId) ?? null, [sortedTables, selectedTableId]);

  const applySchema = useCallback((schema: Awaited<ReturnType<typeof datatablesApi.getProjectSchema>>) => {
    const nextTables = schema.tables.map(({ columns: _columns, ...table }) => table);
    const sorted = sortTablesByName(nextTables);
    setProject(schema.project);
    setTables(nextTables);
    setColumnsMap(Object.fromEntries(schema.tables.map((t) => [t.id, t.columns])));
    setSelectedTableId((prev) => {
      if (prev && sorted.some((t) => t.id === prev)) return prev;
      return sorted[0]?.id ?? null;
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      applySchema(await datatablesApi.getProjectSchema(projectId));
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, applySchema]);

  const refreshSchema = useCallback(async () => {
    try {
      applySchema(await datatablesApi.getProjectSchema(projectId));
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  }, [projectId, applySchema]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (loading) return;
    if (sortedTables.length === 0) {
      setSelectedTableId(null);
      return;
    }
    if (!selectedTableId || !sortedTables.some((t) => t.id === selectedTableId)) {
      setSelectedTableId(sortedTables[0].id);
    }
  }, [loading, sortedTables, selectedTableId]);

  const handleTableCreated = (table: DatatableTable) => {
    setTables((prev) => sortTablesByName([...prev, table]));
    setColumnsMap((prev) => ({ ...prev, [table.id]: [] }));
    setSelectedTableId(table.id);
  };

  const handleTableSaved = (table: DatatableTable, columns: DatatableColumn[]) => {
    setTables((prev) => sortTablesByName(prev.map((t) => (t.id === table.id ? { ...t, ...table } : t))));
    setColumnsMap((prev) => ({ ...prev, [table.id]: columns }));
  };

  const handleTableDeleted = (tableId: string) => {
    setTables((prev) => prev.filter((t) => t.id !== tableId));
    setColumnsMap((prev) => {
      const next = { ...prev };
      delete next[tableId];
      return next;
    });
    setSelectedTableId((prev) => (prev === tableId ? null : prev));
    setEditTableOpen(false);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <DatatableProjectHeader title={project?.name ?? "…"} agentOpen={agentOpen} onToggleAgent={() => setAgentOpen((v) => !v)} onOpenSettings={() => setSettingsOpen(true)} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {sortedTables.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
              <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <FluentIcon name="database-24" size={24} />
              </span>
              <p className="m-0 text-sm font-medium text-foreground">No tables yet</p>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">Create a table to start adding rows</p>
              <NewTablePopover projectId={projectId} onSaved={handleTableCreated}>
                <Button type="primary" icon={<Plus size={16} />}>
                  Add table
                </Button>
              </NewTablePopover>
            </div>
          ) : (
            <>
              <TableTabBar
                tables={sortedTables}
                selectedId={selectedTableId}
                onSelect={setSelectedTableId}
                onEdit={() => setEditTableOpen(true)}
                addButton={
                  <NewTablePopover projectId={projectId} onSaved={handleTableCreated}>
                    <Button type="dashed" size="default" icon={<Plus size={14} />} aria-label="Add table" className="shrink-0" />
                  </NewTablePopover>
                }
              />

              <div className="relative min-h-0 flex-1">{selectedTableId ? <TableRowsPanel key={selectedTableId} tableId={selectedTableId} columns={columnsMap[selectedTableId] ?? []} /> : null}</div>
            </>
          )}
        </div>

        <AgentSidePanel open={agentOpen}>
          <DatatableAgentPanel projectId={projectId} onSchemaChanged={() => void refreshSchema()} />
        </AgentSidePanel>
      </div>

      {project && settingsOpen ? <ProjectSettingsDialog project={project} onClose={() => setSettingsOpen(false)} onUpdated={setProject} /> : null}

      {editTableOpen && selectedTable ? (
        <SchemaPropertiesDialog
          tableId={selectedTable.id}
          tableName={selectedTable.name}
          columns={columnsMap[selectedTable.id] ?? []}
          onClose={() => setEditTableOpen(false)}
          onSaved={(table, columns) => {
            handleTableSaved(table, columns);
            setEditTableOpen(false);
          }}
          onDeleted={() => handleTableDeleted(selectedTable.id)}
        />
      ) : null}
    </div>
  );
}
