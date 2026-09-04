import { type CSSProperties, type Key, type ReactNode, useMemo, useState } from "react";
import { Checkbox } from "../checkbox/Checkbox";
import { Empty } from "../empty/Empty";
import { cn } from "../lib/cn";
import { type ControlSize, normalizeSize } from "../lib/sizes";
import { Pagination } from "../pagination/Pagination";
import { Spin } from "../spin/Spin";

export type SortOrder = "ascend" | "descend" | null;

export type ColumnType<T> = {
  title?: ReactNode;
  dataIndex?: keyof T | string | (string | number)[];
  key?: string;
  width?: number | string;
  minWidth?: number | string;
  align?: "left" | "center" | "right";
  /** Custom cell — Ant Design style `(value, record, index) => ReactNode`. */
  render?: (value: any, record: T, index: number) => ReactNode;
  className?: string;
  ellipsis?: boolean;
  fixed?: "left" | "right";
  /** `true` = default compare on `dataIndex`; or pass a compare fn. */
  sorter?: boolean | ((a: T, b: T) => number);
  sortOrder?: SortOrder;
  defaultSortOrder?: SortOrder;
  onHeaderCell?: () => { className?: string; style?: CSSProperties };
};

export type ColumnsType<T> = ColumnType<T>[];

export type TablePaginationConfig = {
  current?: number;
  pageSize?: number;
  total?: number;
  onChange?: (page: number, pageSize: number) => void;
  hideOnSinglePage?: boolean;
  className?: string;
};

export type TableRowSelection<T> = {
  selectedRowKeys?: Key[];
  defaultSelectedRowKeys?: Key[];
  onChange?: (selectedRowKeys: Key[], selectedRows: T[]) => void;
  getCheckboxProps?: (record: T) => { disabled?: boolean };
  columnWidth?: number | string;
  type?: "checkbox" | "radio";
};

export type TableProps<T extends object = Record<string, unknown>> = {
  columns?: ColumnType<T>[];
  dataSource?: T[];
  rowKey?: keyof T | ((record: T) => Key);
  loading?: boolean;
  /** `false` disables; object enables (client-side slice when `total` omitted). */
  pagination?: false | TablePaginationConfig;
  className?: string;
  size?: ControlSize;
  bordered?: boolean;
  scroll?: { x?: number | string; y?: number | string };
  onRow?: (
    record: T,
    index: number,
  ) => {
    onClick?: () => void;
    className?: string;
    style?: CSSProperties;
  };
  locale?: { emptyText?: ReactNode };
  showHeader?: boolean;
  title?: ReactNode | ((data: readonly T[]) => ReactNode);
  footer?: ReactNode | ((data: readonly T[]) => ReactNode);
  rowSelection?: TableRowSelection<T>;
  rowClassName?: string | ((record: T, index: number) => string);
  onChange?: (pagination: TablePaginationConfig | false, _filters: Record<string, unknown>, sorter: { columnKey?: string; field?: string; order?: SortOrder }) => void;
};

function getRowKey<T extends object>(record: T, index: number, rowKey?: TableProps<T>["rowKey"]): Key {
  if (typeof rowKey === "function") return rowKey(record);
  if (typeof rowKey === "string" || typeof rowKey === "number") {
    return String(record[rowKey as keyof T] ?? index);
  }
  if ("id" in record) return String((record as { id: unknown }).id);
  if ("key" in record) return String((record as { key: unknown }).key);
  return index;
}

function getCellValue<T>(record: T, dataIndex?: ColumnType<T>["dataIndex"]): unknown {
  if (dataIndex == null) return undefined;
  if (Array.isArray(dataIndex)) {
    let cur: unknown = record;
    for (const part of dataIndex) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = (cur as Record<string | number, unknown>)[part];
    }
    return cur;
  }
  return (record as Record<string, unknown>)[dataIndex as string];
}

function getColumnKey<T>(col: ColumnType<T>, index: number): string {
  if (col.key != null) return col.key;
  if (Array.isArray(col.dataIndex)) return col.dataIndex.join(".");
  if (col.dataIndex != null) return String(col.dataIndex);
  return String(index);
}

function defaultCompare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** Dual filled carets with a clear gap (stroke chevrons merge into a ◇). */
function SortIcon({ order }: { order: SortOrder | undefined }) {
  return (
    <span className="ml-1.5 inline-flex shrink-0 flex-col items-center gap-0.5" aria-hidden>
      <svg width="7" height="4" viewBox="0 0 7 4" className={cn(order === "ascend" ? "text-foreground" : "text-muted-foreground/45")}>
        <path d="M3.5 0 7 4H0z" fill="currentColor" />
      </svg>
      <svg width="7" height="4" viewBox="0 0 7 4" className={cn(order === "descend" ? "text-foreground" : "text-muted-foreground/45")}>
        <path d="M3.5 4 0 0h7z" fill="currentColor" />
      </svg>
    </span>
  );
}

function sizeClasses(size: ControlSize | undefined) {
  const s = normalizeSize(size);
  if (s === "small") {
    return {
      head: "h-9 px-2 text-xs",
      cell: "px-2 py-1.5 text-xs",
      check: "w-9 px-2",
    };
  }
  if (s === "large") {
    return {
      head: "h-12 px-3 text-sm",
      cell: "px-3 py-3 text-sm",
      check: "w-12 px-3",
    };
  }
  // default — matches shadcn TableHead h-10 / TableCell p-2 / text-sm
  return {
    head: "h-10 px-2 text-sm",
    cell: "p-2 text-sm",
    check: "w-10 px-2",
  };
}

export function Table<T extends object = Record<string, unknown>>({ columns = [], dataSource = [], rowKey, loading, pagination, className, size, bordered, scroll, onRow, locale, showHeader = true, title, footer, rowSelection, rowClassName, onChange }: TableProps<T>) {
  const sz = sizeClasses(size);

  const selectionControlled = rowSelection?.selectedRowKeys !== undefined;
  const [innerSelected, setInnerSelected] = useState<Key[]>(() => rowSelection?.defaultSelectedRowKeys ?? []);
  const selectedKeys = selectionControlled ? (rowSelection?.selectedRowKeys ?? []) : innerSelected;

  const [innerPage, setInnerPage] = useState(1);
  const [innerPageSize, setInnerPageSize] = useState(10);

  const initialSort = useMemo(() => {
    const col = columns.find((c) => c.defaultSortOrder);
    if (!col) return { key: null as string | null, order: null as SortOrder };
    return { key: getColumnKey(col, columns.indexOf(col)), order: col.defaultSortOrder ?? null };
  }, [columns]);

  const [innerSort, setInnerSort] = useState(initialSort);

  const controlledSortCol = columns.find((c) => c.sortOrder !== undefined);
  const sortState = controlledSortCol
    ? {
        key: getColumnKey(controlledSortCol, columns.indexOf(controlledSortCol)),
        order: controlledSortCol.sortOrder ?? null,
      }
    : innerSort;

  const paginationOff = pagination === false;
  const pageConfig: TablePaginationConfig = paginationOff ? {} : (pagination ?? {});
  const pageControlled = pageConfig.current !== undefined;
  const current = pageControlled ? (pageConfig.current ?? 1) : innerPage;
  const pageSize = pageConfig.pageSize ?? (pageControlled ? 10 : innerPageSize);
  const serverSide = pageConfig.total !== undefined;

  const sortedData = useMemo(() => {
    if (!sortState.key || !sortState.order) return dataSource;
    const colIndex = columns.findIndex((c, i) => getColumnKey(c, i) === sortState.key);
    const col = colIndex >= 0 ? columns[colIndex] : undefined;
    if (!col?.sorter) return dataSource;
    const dir = sortState.order === "ascend" ? 1 : -1;
    const cmp = typeof col.sorter === "function" ? col.sorter : (a: T, b: T) => defaultCompare(getCellValue(a, col.dataIndex), getCellValue(b, col.dataIndex));
    return [...dataSource].sort((a, b) => cmp(a, b) * dir);
  }, [columns, dataSource, sortState.key, sortState.order]);

  const total = serverSide ? (pageConfig.total ?? sortedData.length) : sortedData.length;

  const pageData = useMemo(() => {
    if (paginationOff || serverSide) return sortedData;
    const start = (current - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, paginationOff, serverSide, current, pageSize]);

  const showPagination = !paginationOff && !(pageConfig.hideOnSinglePage && total <= pageSize) && (total > 0 || serverSide);

  const emitSelection = (keys: Key[]) => {
    if (!selectionControlled) setInnerSelected(keys);
    const rows = dataSource.filter((r, i) => keys.includes(getRowKey(r, i, rowKey)));
    rowSelection?.onChange?.(keys, rows);
  };

  /** Two modes only: ascend ↔ descend. */
  const toggleSort = (col: ColumnType<T>, index: number) => {
    if (!col.sorter) return;
    const key = getColumnKey(col, index);
    const next: SortOrder = sortState.key === key && sortState.order === "ascend" ? "descend" : "ascend";
    if (!controlledSortCol) setInnerSort({ key, order: next });
    onChange?.(
      paginationOff ? false : { current, pageSize, total },
      {},
      {
        columnKey: key,
        field: Array.isArray(col.dataIndex) ? col.dataIndex.join(".") : String(col.dataIndex ?? key),
        order: next,
      },
    );
  };

  const handlePageChange = (page: number, nextSize: number) => {
    if (!pageControlled) {
      setInnerPage(page);
      setInnerPageSize(nextSize);
    }
    pageConfig.onChange?.(page, nextSize);
    onChange?.({ current: page, pageSize: nextSize, total }, {}, { columnKey: sortState.key ?? undefined, order: sortState.order });
  };

  const pageKeys = pageData.map((r, i) => getRowKey(r, (current - 1) * pageSize + i, rowKey));
  const enabledPageKeys = pageData
    .map((r, i) => ({ key: pageKeys[i]!, disabled: rowSelection?.getCheckboxProps?.(r)?.disabled }))
    .filter((x) => !x.disabled)
    .map((x) => x.key);
  const allPageSelected = enabledPageKeys.length > 0 && enabledPageKeys.every((k) => selectedKeys.includes(k));
  const somePageSelected = enabledPageKeys.some((k) => selectedKeys.includes(k));

  const titleNode = typeof title === "function" ? title(pageData) : title;
  const footerNode = typeof footer === "function" ? footer(pageData) : footer;
  const selectionColWidth = rowSelection?.columnWidth;
  const colCount = (columns.length || 1) + (rowSelection ? 1 : 0);

  const alignClass = (align?: "left" | "center" | "right") => (align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left");

  return (
    <div className={cn("relative w-full", className)}>
      {titleNode != null ? <div className="mb-3 text-sm font-medium text-foreground">{titleNode}</div> : null}

      <Spin spinning={Boolean(loading)}>
        <div data-slot="table-container" className={cn("relative w-full overflow-x-auto", bordered && "rounded-md border border-border")} style={scroll?.x != null ? { overflowX: "auto" } : undefined}>
          <div style={scroll?.y != null ? { maxHeight: scroll.y, overflow: "auto" } : undefined}>
            <table data-slot="table" className="w-full caption-bottom border-collapse text-sm">
              {showHeader ? (
                <thead data-slot="table-header" className="[&_tr]:border-b">
                  <tr data-slot="table-row" className="border-b transition-colors hover:bg-transparent">
                    {rowSelection ? (
                      <th data-slot="table-head" className={cn(sz.head, sz.check, "align-middle font-medium text-foreground", scroll?.y && "sticky top-0 z-10 bg-background", bordered && "border-b border-border")} style={selectionColWidth != null ? { width: selectionColWidth } : undefined}>
                        <div className="flex items-center justify-center">
                          {rowSelection.type === "radio" ? null : (
                            <Checkbox
                              checked={allPageSelected}
                              indeterminate={somePageSelected && !allPageSelected}
                              onChange={(checked) => {
                                if (checked) emitSelection(Array.from(new Set([...selectedKeys, ...enabledPageKeys])));
                                else emitSelection(selectedKeys.filter((k: Key) => !enabledPageKeys.includes(k)));
                              }}
                              aria-label="Select all"
                            />
                          )}
                        </div>
                      </th>
                    ) : null}
                    {columns.map((col, i) => {
                      const key = getColumnKey(col, i);
                      const order = sortState.key === key ? sortState.order : undefined;
                      const headerExtra = col.onHeaderCell?.();
                      const sortable = Boolean(col.sorter);
                      return (
                        <th
                          key={key}
                          data-slot="table-head"
                          className={cn(sz.head, "align-middle font-medium whitespace-nowrap text-foreground", alignClass(col.align), scroll?.y && "sticky top-0 z-10 bg-background", bordered && "border-b border-border", sortable && "cursor-pointer select-none", col.className, headerExtra?.className)}
                          style={{
                            width: col.width,
                            minWidth: col.minWidth,
                            ...headerExtra?.style,
                          }}
                          onClick={sortable ? () => toggleSort(col, i) : undefined}
                        >
                          <span className={cn("inline-flex max-w-full items-center", col.align === "center" && "justify-center", col.align === "right" && "w-full justify-end")}>
                            <span className="min-w-0 truncate">{col.title}</span>
                            {sortable ? <SortIcon order={order ?? undefined} /> : null}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
              ) : null}

              <tbody data-slot="table-body" className="[&_tr:last-child]:border-0">
                {pageData.length === 0 ? (
                  <tr data-slot="table-row" className="border-b">
                    <td data-slot="table-cell" colSpan={colCount} className={cn(sz.cell, "text-center align-middle")}>
                      {locale?.emptyText ?? <Empty description="No data" className="py-10" />}
                    </td>
                  </tr>
                ) : (
                  pageData.map((record, index) => {
                    const absoluteIndex = paginationOff || serverSide ? index : (current - 1) * pageSize + index;
                    const key = getRowKey(record, absoluteIndex, rowKey);
                    const rowProps = onRow?.(record, absoluteIndex);
                    const extraClass = typeof rowClassName === "function" ? rowClassName(record, absoluteIndex) : rowClassName;
                    const selected = selectedKeys.includes(key);
                    return (
                      <tr key={key} data-slot="table-row" data-state={selected ? "selected" : undefined} className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", bordered && "border-border", rowProps?.className, extraClass)} style={rowProps?.style} onClick={rowProps?.onClick}>
                        {rowSelection ? (
                          <td data-slot="table-cell" className={cn(sz.cell, sz.check, "align-middle")} style={selectionColWidth != null ? { width: selectionColWidth } : undefined}>
                            <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                              {rowSelection.type === "radio" ? (
                                <input type="radio" name="nonla-table-row-select" checked={selected} disabled={rowSelection.getCheckboxProps?.(record)?.disabled} aria-label="Select row" className="size-3.5 accent-foreground" onChange={() => emitSelection([key])} />
                              ) : (
                                <Checkbox
                                  checked={selected}
                                  disabled={rowSelection.getCheckboxProps?.(record)?.disabled}
                                  aria-label="Select row"
                                  onChange={(next) => {
                                    if (next) emitSelection([...selectedKeys, key]);
                                    else emitSelection(selectedKeys.filter((k: Key) => k !== key));
                                  }}
                                />
                              )}
                            </div>
                          </td>
                        ) : null}
                        {columns.map((col, i) => {
                          const raw = getCellValue(record, col.dataIndex);
                          const content = col.render ? col.render(raw, record, absoluteIndex) : (raw as ReactNode);
                          return (
                            <td
                              key={getColumnKey(col, i)}
                              data-slot="table-cell"
                              className={cn(sz.cell, "align-middle", alignClass(col.align), col.ellipsis ? "max-w-0 truncate" : "whitespace-nowrap", col.className)}
                              style={{ width: col.width, minWidth: col.minWidth }}
                              title={col.ellipsis && (typeof content === "string" || typeof content === "number") ? String(content) : undefined}
                            >
                              {content}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>

              {footerNode != null ? (
                <tfoot data-slot="table-footer" className="border-t bg-muted/50 font-medium [&>tr]:last:border-b-0">
                  <tr>
                    <td colSpan={colCount} className={cn(sz.cell, "align-middle text-muted-foreground")}>
                      {footerNode}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>
      </Spin>

      {showPagination ? (
        <div className={cn("mt-4 flex justify-end", pageConfig.className)}>
          <Pagination current={current} pageSize={pageSize} total={total} size={size} onChange={handlePageChange} />
        </div>
      ) : null}
    </div>
  );
}
