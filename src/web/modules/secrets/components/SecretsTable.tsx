import { type ColumnsType, Table } from "devnonla-ui";
import { type RefObject, useEffect, useRef, useState } from "react";
import { cn } from "src/common/lib/cn";
import type { SecretEntry } from "src/common/types";
import { NewSecretActions, NewSecretKeyCell, NewSecretProvider, type NewSecretRowHandle, NewSecretValueCell } from "./NewSecretRow";
import { type SecretEditField, SecretKeyCell, SecretValueCell } from "./SecretRow";

const NEW_ROW_ID = "__new__";

type SecretTableRow = SecretEntry | { id: typeof NEW_ROW_ID };

function isNewRow(row: SecretTableRow): row is { id: typeof NEW_ROW_ID } {
  return row.id === NEW_ROW_ID;
}

interface SecretsTableProps {
  items: SecretEntry[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onUpdate: (id: string, patch: { key?: string; value?: string }) => Promise<void>;
  onCreate: (payload: { key: string; value: string }) => Promise<void>;
  selectedRowKeys: string[];
  onSelectedRowKeysChange: (keys: string[]) => void;
  newSecretRef: RefObject<NewSecretRowHandle | null>;
  adding: boolean;
  onCancelAdd: () => void;
  hasSearch: boolean;
  searchQuery: string;
  onClearSearch: () => void;
}

export function SecretsTable({ items, page, pageSize, total, onPageChange, onUpdate, onCreate, selectedRowKeys, onSelectedRowKeysChange, newSecretRef, adding, onCancelAdd, hasSearch, searchQuery, onClearSearch }: SecretsTableProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(400);
  const [editing, setEditing] = useState<{ id: string; field: SecretEditField } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const pager = host.querySelector("[data-slot=pagination]")?.parentElement;
      const pagerH = pager instanceof HTMLElement ? pager.offsetHeight + Number.parseFloat(getComputedStyle(pager).marginTop || "0") : 0;
      setScrollY(Math.max(120, host.clientHeight - pagerH));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    measure();
    return () => ro.disconnect();
  }, [total, page]);

  const startEdit = (id: string, field: SecretEditField) => setEditing({ id, field });
  const cancelEdit = () => setEditing(null);

  const columns: ColumnsType<SecretTableRow> = [
    {
      title: "Key",
      dataIndex: "key",
      key: "key",
      render: (_, row) => {
        if (isNewRow(row)) return <NewSecretKeyCell />;
        const editingKey = editing?.id === row.id && editing.field === "key";
        return <SecretKeyCell entry={row} editing={editingKey} onStartEdit={() => startEdit(row.id, "key")} onCancelEdit={cancelEdit} onUpdate={onUpdate} />;
      },
    },
    {
      title: "Value",
      key: "value",
      flex: 1,
      render: (_, row) => {
        if (isNewRow(row)) return <NewSecretValueCell />;
        const editingValue = editing?.id === row.id && editing.field === "value";
        return <SecretValueCell entry={row} editing={editingValue} onStartEdit={() => startEdit(row.id, "value")} onCancelEdit={cancelEdit} onUpdate={onUpdate} />;
      },
    },
  ];

  if (adding) {
    columns.push({
      title: "",
      key: "actions",
      align: "right",
      render: (_, row) => (isNewRow(row) ? <NewSecretActions /> : null),
    });
  }

  const dataSource: SecretTableRow[] = adding ? [{ id: NEW_ROW_ID }, ...items] : items;

  return (
    <NewSecretProvider onCreate={onCreate} onCancel={onCancelAdd} active={adding} handleRef={newSecretRef}>
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={dataSource}
          pagination={{
            current: page,
            pageSize,
            total,
            hideOnSinglePage: true,
            showSizeChanger: false,
            showTotal: (count, [from, to]) => `${from}–${to} of ${count}`,
            className: "px-4 pb-4",
            onChange: onPageChange,
          }}
          scroll={{ y: scrollY }}
          className="bg-card [&_tr]:border-b-0 [&_thead_tr]:border-b-0 [&_td]:border-border/20 [&_th]:border-border/20"
          rowSelection={{
            type: "checkbox",
            selectedRowKeys,
            onChange: (keys) => onSelectedRowKeysChange(keys.map(String)),
            getCheckboxProps: (row) => ({ disabled: isNewRow(row) }),
          }}
          onRow={(row) => ({ className: cn(isNewRow(row) && "bg-muted/30") })}
          locale={{
            emptyText: hasSearch ? (
              <div className="py-8 text-center">
                <p className="mb-2 text-sm text-muted-foreground">
                  No secrets match &ldquo;<span className="font-medium text-foreground">{searchQuery}</span>&rdquo;
                </p>
                <button type="button" onClick={onClearSearch} className="text-xs font-medium text-primary hover:underline">
                  Clear search filter
                </button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No secrets stored yet. Click Add secret to create one.</span>
            ),
          }}
        />
      </div>
    </NewSecretProvider>
  );
}
