import { Button, message } from "@nonla-agents/ui";
import { AltArrowLeftIcon } from "@solar-icons/react/dynamic/alt-arrow-left";
import { DatabaseIcon } from "@solar-icons/react/dynamic/database";
import { SettingsIcon } from "@solar-icons/react/dynamic/settings";
import { WidgetIcon } from "@solar-icons/react/dynamic/widget";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "src/common/lib/cn";
import type { DatatableColumn, DatatableProject, DatatableTable } from "src/common/types";
import { datatablesApi } from "./common/datatablesApi";
import { ProjectSettingsDialog } from "./components/ProjectSettingsDialog";
import { TableRowsPanel } from "./components/TableRowsPanel";

function sortTablesByName(tables: DatatableTable[]) {
  return [...tables].sort((a, b) => a.name.localeCompare(b.name));
}

export default function DatatableProjectPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<DatatableProject | null>(null);
  const [tables, setTables] = useState<DatatableTable[]>([]);
  const [columnsMap, setColumnsMap] = useState<Record<string, DatatableColumn[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const sortedTables = useMemo(() => sortTablesByName(tables), [tables]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const schema = await datatablesApi.getProjectSchema(projectId);
      const nextTables = schema.tables.map(({ columns: _columns, ...table }) => table);
      const sorted = sortTablesByName(nextTables);
      setProject(schema.project);
      setTables(nextTables);
      setColumnsMap(Object.fromEntries(schema.tables.map((t) => [t.id, t.columns])));
      setSelectedTableId((prev) => {
        if (prev && sorted.some((t) => t.id === prev)) return prev;
        return sorted[0]?.id ?? null;
      });
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-4 py-3">
        <button type="button" onClick={() => navigate("/datatables")} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none" title="Back" aria-label="Back to datatables">
          <AltArrowLeftIcon size={16} />
        </button>
        <DatabaseIcon size={20} weight="BoldDuotone" className="shrink-0 text-brand-soft" />
        <h1 className="m-0 min-w-0 flex-1 truncate text-lg font-semibold text-foreground">{project?.name ?? "…"}</h1>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button icon={<WidgetIcon size={16} weight="BoldDuotone" />} onClick={() => navigate(`/datatables/${projectId}/editor`)}>
            Schema editor
          </Button>
          <Button type="text" icon={<SettingsIcon size={16} weight="BoldDuotone" />} onClick={() => setSettingsOpen(true)} aria-label="Project settings" />
        </div>
      </div>

      {sortedTables.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
          <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <DatabaseIcon size={24} weight="BoldDuotone" />
          </span>
          <p className="m-0 text-sm font-medium text-foreground">No tables yet</p>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Open the schema editor to create your first table</p>
          <Button type="primary" icon={<WidgetIcon size={16} weight="BoldDuotone" />} onClick={() => navigate(`/datatables/${projectId}/editor`)}>
            Open schema editor
          </Button>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2.5">
            {sortedTables.map((table) => {
              const active = table.id === selectedTableId;
              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => setSelectedTableId(table.id)}
                  className={cn(
                    "inline-flex max-w-full cursor-pointer items-center gap-1.5 truncate rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "border-brand/35 bg-brand/15 text-brand-soft" : "border-border-subtle bg-muted/60 text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <DatabaseIcon size={14} weight="BoldDuotone" className="shrink-0 opacity-70" />
                  <span className="truncate font-mono text-[13px]">{table.name}</span>
                </button>
              );
            })}
          </div>

          <div className="relative min-h-0 flex-1">{selectedTableId ? <TableRowsPanel key={selectedTableId} tableId={selectedTableId} columns={columnsMap[selectedTableId] ?? []} /> : null}</div>
        </>
      )}

      {project && settingsOpen ? <ProjectSettingsDialog project={project} onClose={() => setSettingsOpen(false)} onUpdated={setProject} /> : null}
    </div>
  );
}
