import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { DatabaseIcon } from "@solar-icons/react/dynamic/database";
import { MenuDotsIcon } from "@solar-icons/react/dynamic/menu-dots";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { Button, Dropdown, Modal, message } from "antd";
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
import { useAppTimezone } from "src/common/hooks/useAppTimezone";
import { cn } from "src/common/lib/cn";
import type { DatatableColumn, DatatableRow } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { cellValuesEqual } from "../common/cellValueUtils";
import { clampColWidth, columnTrackSize, defaultColumnWidthPx, fitColumnWidthPx } from "../common/columnUtils";
import { PAGE_SIZE } from "../common/constants";
import { datatablesApi } from "../common/datatablesApi";
import { EditableCell } from "./EditableCell";
import { PropertyHeader } from "./PropertyHeader";
import { RowDialog } from "./RowDialog";

type EditingCell = { rowId: string; colId: string };

type TableRowsPanelProps = {
  tableId: string;
  /** Schema already loaded on the project page — don't refetch here. */
  columns: DatatableColumn[];
};

export function TableRowsPanel({ tableId, columns }: TableRowsPanelProps) {
  const timeZone = useAppTimezone();
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<DatatableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rowDialog, setRowDialog] = useState<DatatableRow | "create" | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [deletingRow, setDeletingRow] = useState<DatatableRow | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const rowsLenRef = useRef(0);
  const totalRef = useRef(0);
  const suppressNextCellActionRef = useRef(false);

  rowsLenRef.current = rows.length;
  totalRef.current = total;

  const armSuppressNextCellAction = () => {
    suppressNextCellActionRef.current = true;
    window.setTimeout(() => {
      suppressNextCellActionRef.current = false;
    }, 0);
  };

  const tryCellAction = () => {
    if (!suppressNextCellActionRef.current) return true;
    suppressNextCellActionRef.current = false;
    return false;
  };

  const stopEditing = () => {
    armSuppressNextCellAction();
    setEditingCell(null);
  };

  const hasMore = rows.length < total;

  const syncColumnWidths = (list: DatatableColumn[]) => {
    setColumnWidths((prev) => {
      const next: Record<string, number> = {};
      for (const col of list) {
        next[col.id] = prev[col.id] ?? defaultColumnWidthPx(col);
      }
      return next;
    });
  };

  const fetchRows = async (offset: number, append: boolean) => {
    const result = await datatablesApi.queryRows(tableId, { limit: PAGE_SIZE, offset });
    setTotal(result.total);
    setRows((prev) => (append ? [...prev, ...result.items] : result.items));
    return result;
  };

  const loadInitial = async () => {
    setLoading(true);
    try {
      await fetchRows(0, false);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMoreRef.current || rowsLenRef.current >= totalRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await fetchRows(rowsLenRef.current, true);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const reloadRows = async () => {
    try {
      await fetchRows(0, false);
      scrollRef.current?.scrollTo({ top: 0 });
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const saveCell = async (row: DatatableRow, col: DatatableColumn, nextValue: unknown) => {
    const prevValue = row.data?.[col.name];
    if (cellValuesEqual(prevValue, nextValue)) {
      stopEditing();
      return;
    }
    const optimistic: DatatableRow = {
      ...row,
      data: { ...row.data, [col.name]: nextValue },
    };
    setRows((prev) => prev.map((r) => (r.id === row.id ? optimistic : r)));
    stopEditing();
    try {
      const updated = await datatablesApi.updateRow(row.id, { [col.name]: nextValue });
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (err: unknown) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    setEditingCell(null);
    setRows([]);
    setTotal(0);
    void loadInitial();
  }, [tableId]);

  useEffect(() => {
    syncColumnWidths(columns);
  }, [columns]);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { root, rootMargin: "120px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tableId, hasMore, rows.length]);

  const startColumnResize = (colId: string, startWidth: number, e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      setColumnWidths((prev) => ({
        ...prev,
        [colId]: clampColWidth(startWidth + (ev.clientX - startX)),
      }));
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const fitColumn = (col: DatatableColumn) => {
    setColumnWidths((prev) => ({
      ...prev,
      [col.id]: fitColumnWidthPx(col, rows, timeZone),
    }));
  };

  const gridTemplate = ["40px", ...columns.map((col) => columnTrackSize(col, columnWidths[col.id])), "40px"].join(" ");
  // Bottom status bar sits outside the scroll area so the count stays pinned.
  const showStatusBar = !loading && columns.length > 0;
  const loadedCount = rows.length;

  return (
    // Parent must be a sized flex/absolute container (drawer body or page shell).
    // Absolute fill pins both scrollbars to the visible viewport — horizontal bar
    // stays at the bottom of the panel instead of the bottom of the row list.
    <div className="relative h-full min-h-0 w-full flex-1">
      <div ref={scrollRef} className={cn("absolute inset-x-0 top-0 overflow-auto overscroll-contain", showStatusBar ? "bottom-8" : "bottom-0")}>
        <RenderIf
          condition={!loading && columns.length === 0}
          fallback={
            <div className={cn("min-w-max", loading && "opacity-60")}>
              <div className="sticky top-0 z-10 grid border-b border-border-subtle bg-card" style={{ gridTemplateColumns: gridTemplate }}>
                <div className="flex h-9 items-center justify-center border-r border-border-subtle px-1 text-[11px] font-medium tabular-nums text-quaternary-foreground">#</div>
                {columns.map((col) => {
                  const width = columnWidths[col.id] ?? defaultColumnWidthPx(col);
                  return (
                    <div key={col.id} className="relative h-9 border-r border-border-subtle">
                      <PropertyHeader col={col} timeZone={timeZone} />
                      <button
                        type="button"
                        aria-label={`Resize ${col.name}`}
                        title="Drag to resize · Double-click to fit"
                        className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none border-0 bg-transparent p-0 hover:bg-brand/30 active:bg-brand/40"
                        onMouseDown={(e) => startColumnResize(col.id, width, e)}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          fitColumn(col);
                        }}
                      />
                    </div>
                  );
                })}
                <div />
              </div>

              {rows.map((row, idx) => (
                <div key={row.id} className="group grid border-b border-border-subtle transition-colors hover:bg-muted/35" style={{ gridTemplateColumns: gridTemplate }}>
                  <div className="flex h-9 items-center justify-center border-r border-border-subtle text-[11px] tabular-nums text-quaternary-foreground">{idx + 1}</div>
                  {columns.map((col) => (
                    <EditableCell
                      key={col.id}
                      col={col}
                      value={row.data?.[col.name]}
                      editing={editingCell?.rowId === row.id && editingCell?.colId === col.id}
                      timeZone={timeZone}
                      onStartEdit={() => setEditingCell({ rowId: row.id, colId: col.id })}
                      onCommit={(next) => void saveCell(row, col, next)}
                      onCancel={stopEditing}
                      tryCellAction={tryCellAction}
                    />
                  ))}
                  <div className="flex h-9 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Dropdown
                      menu={{
                        items: [
                          {
                            key: "edit",
                            label: "Edit",
                            icon: <PenNewSquareIcon size={14} />,
                            onClick: () => setRowDialog(row),
                          },
                          { type: "divider" },
                          {
                            key: "delete",
                            label: "Delete",
                            danger: true,
                            icon: <TrashBinMinimalisticIcon size={14} />,
                            onClick: () => setDeletingRow(row),
                          },
                        ],
                      }}
                      trigger={["click"]}
                    >
                      <Button type="text" size="small" icon={<MenuDotsIcon size={14} weight="Bold" />} />
                    </Dropdown>
                  </div>
                </div>
              ))}

              <div ref={sentinelRef} className="h-px w-full" />
              <RenderIf condition={loadingMore}>
                <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
              </RenderIf>
            </div>
          }
        >
          <div className="flex h-full min-h-60 flex-col items-center justify-center px-8 py-16">
            <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <DatabaseIcon size={24} weight="BoldDuotone" />
            </span>
            <p className="m-0 text-sm font-medium text-foreground">No properties yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Open Schema editor to add properties for this table</p>
          </div>
        </RenderIf>
      </div>

      <RenderIf condition={showStatusBar}>
        <div className="absolute inset-x-0 bottom-0 z-10 flex h-8 items-center justify-between gap-3 border-t border-border-subtle bg-card px-3">
          <Button type="text" size="small" disabled={loading || columns.length === 0} icon={<AddCircleIcon size={14} />} onClick={() => setRowDialog("create")} className="text-muted-foreground">
            Add new row
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {loadedCount === 0 && total === 0 ? "0 rows" : loadedCount >= total ? `${total.toLocaleString()} ${total === 1 ? "row" : "rows"}` : `${loadedCount.toLocaleString()} of ${total.toLocaleString()} rows`}
            {loadingMore ? " · Loading…" : null}
          </span>
        </div>
      </RenderIf>

      <RenderIf condition={rowDialog !== null}>
        <RowDialog tableId={tableId} columns={columns} edit={rowDialog === "create" ? null : rowDialog} timeZone={timeZone} onClose={() => setRowDialog(null)} onSaved={reloadRows} />
      </RenderIf>

      <Modal
        open={!!deletingRow}
        title="Delete row?"
        okText="Delete"
        okButtonProps={{ danger: true }}
        onCancel={() => setDeletingRow(null)}
        onOk={async () => {
          if (!deletingRow) return;
          await datatablesApi.deleteRow(deletingRow.id);
          message.success("Deleted");
          setDeletingRow(null);
          await reloadRows();
        }}
      >
        <p className="m-0 text-sm text-muted-foreground">This row will be permanently deleted.</p>
      </Modal>
    </div>
  );
}
