import { Button, EditableInput, Popconfirm, SearchInput, Table, Tooltip, message } from "devnonla-ui";
import type { ColumnsType } from "devnonla-ui";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "src/common/lib/cn";
import type { KvStoreEntry } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { createKvEntry, deleteKvEntry, fetchKvStore, updateKvEntry, updateKvStoreFilter } from "./common/kvStoreSlice";
import { NewKvActions, NewKvKeyCell, NewKvProvider, type NewKvRowHandle, NewKvValueCell } from "./components/NewKvRow";

const PAGE_SIZE = 50;
const NEW_ROW_ID = "__new__";

type KvTableRow = KvStoreEntry | { id: typeof NEW_ROW_ID };

function isNewRow(row: KvTableRow): row is { id: typeof NEW_ROW_ID } {
  return row.id === NEW_ROW_ID;
}

export default function KvStorePage() {
  const dispatch = useAppDispatch();
  const items = useAppSelector((s) => s.kvStore.items) as KvStoreEntry[];
  const total = useAppSelector((s) => s.kvStore.total);
  const page = useAppSelector((s) => s.kvStore.filter.page) ?? 1;
  const filterSearch = useAppSelector((s) => s.kvStore.filter.search) ?? "";
  const [adding, setAdding] = useState(false);
  const newRowRef = useRef<NewKvRowHandle>(null);
  const [editing, setEditing] = useState<{ id: string; field: "key" | "value" } | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(400);

  const hasSearch = filterSearch.length > 0;

  useEffect(() => {
    dispatch(fetchKvStore());
  }, [dispatch]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
    if (page > maxPage) {
      dispatch(updateKvStoreFilter({ page: maxPage }));
      dispatch(fetchKvStore({ page: maxPage }));
    }
  }, [dispatch, total, page]);

  useEffect(() => {
    const host = tableHostRef.current;
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

  const handleSearch = (q: string) => {
    if (q === filterSearch) return;
    dispatch(updateKvStoreFilter({ search: q || undefined, page: 1 }));
    dispatch(fetchKvStore({ page: 1, search: q || undefined }));
  };

  const handleClearSearch = () => {
    dispatch(updateKvStoreFilter({ search: undefined, page: 1 }));
    dispatch(fetchKvStore({ page: 1, search: undefined }));
  };

  const handlePageChange = (nextPage: number) => {
    dispatch(updateKvStoreFilter({ page: nextPage }));
    dispatch(fetchKvStore({ page: nextPage }));
  };

  const handleUpdate = async (id: string, patch: { key?: string; value?: string }) => {
    try {
      await dispatch(updateKvEntry({ id, ...patch })).unwrap();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const handleCreate = async (payload: { key: string; value: string }) => {
    try {
      await dispatch(createKvEntry(payload)).unwrap();
      message.success(`Created ${payload.key}`);
      setAdding(false);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const handleAddClick = () => {
    if (adding) {
      newRowRef.current?.focusKey();
      return;
    }
    setAdding(true);
  };

  const handleDeleteSelected = async () => {
    const ids = selectedRowKeys;
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map((id) => dispatch(deleteKvEntry(id)).unwrap()));
    const failed = results.filter((r) => r.status === "rejected").length;
    setSelectedRowKeys([]);
    if (failed === 0) message.success(ids.length === 1 ? "Deleted" : `Deleted ${ids.length}`);
    else message.error(failed === ids.length ? "Delete failed" : `Deleted ${ids.length - failed}, ${failed} failed`);
    await dispatch(fetchKvStore());
  };

  const columns: ColumnsType<KvTableRow> = [
    {
      title: "Key",
      dataIndex: "key",
      key: "key",
      flex: 1,
      render: (_, row) => {
        if (isNewRow(row)) return <NewKvKeyCell />;
        return (
          <div className="[&_code]:font-sans [&_code]:font-medium [&_code]:tracking-normal">
            <EditableInput.Key size="small" value={row.key} editing={editing?.id === row.id && editing.field === "key"} onStartEdit={() => setEditing({ id: row.id, field: "key" })} onCancelEdit={() => setEditing(null)} placeholder="BASE_URL" onSave={(key) => handleUpdate(row.id, { key })} />
          </div>
        );
      },
    },
    {
      title: "Value",
      dataIndex: "value",
      key: "value",
      flex: 2,
      render: (v: string, row) => {
        if (isNewRow(row)) return <NewKvValueCell />;
        return (
          <EditableInput
            display={
              <Tooltip title={v.length > 80 ? v : undefined}>
                <span className="block truncate font-mono text-xs text-muted-foreground">{v}</span>
              </Tooltip>
            }
            editing={editing?.id === row.id && editing.field === "value"}
            onStartEdit={() => setEditing({ id: row.id, field: "value" })}
            onCancelEdit={() => setEditing(null)}
            initialValue={v}
            placeholder="Value"
            type="textarea"
            minWidth={320}
            onSave={(value) => handleUpdate(row.id, { value })}
          />
        );
      },
    },
  ];

  if (adding) {
    columns.push({
      title: "",
      key: "actions",
      align: "right",
      render: (_, row) => (isNewRow(row) ? <NewKvActions /> : null),
    });
  }

  const dataSource: KvTableRow[] = adding ? [{ id: NEW_ROW_ID }, ...items] : items;

  return (
    <PageShell className="box-border flex h-full min-h-0 flex-col overflow-hidden pt-4" contentClassName="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <SearchInput defaultValue={filterSearch} onChange={handleSearch} placeholder="Search keys..." className="w-56" />
        <div className="flex shrink-0 items-center gap-2">
          {selectedRowKeys.length > 0 ? (
            <Popconfirm title={selectedRowKeys.length === 1 ? "Delete 1 entry?" : `Delete ${selectedRowKeys.length} entries?`} description="Tools using these keys will get null from nonlaagents.kv.get." okText="Delete" okType="danger" onConfirm={handleDeleteSelected} styles={{ root: { width: 280 } }}>
              <Button danger icon={<Trash2 size={16} />}>
                Delete ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
          ) : null}
          <Button type="primary" icon={<Plus />} onClick={handleAddClick}>
            Add
          </Button>
        </div>
      </div>

      <NewKvProvider onCreate={handleCreate} onCancel={() => setAdding(false)} active={adding} handleRef={newRowRef}>
        <div ref={tableHostRef} className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={dataSource}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              hideOnSinglePage: true,
              showSizeChanger: false,
              showTotal: (count, [from, to]) => `${from}–${to} of ${count}`,
              className: "px-4 pb-4",
              onChange: handlePageChange,
            }}
            scroll={{ y: scrollY }}
            className="bg-card [&_tr]:border-b-0 [&_thead_tr]:border-b-0 [&_td]:border-border/20 [&_th]:border-border/20"
            rowSelection={{
              type: "checkbox",
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys.map(String)),
              getCheckboxProps: (row) => ({ disabled: isNewRow(row) }),
            }}
            onRow={(row) => ({ className: cn(isNewRow(row) && "bg-muted/30") })}
            locale={{
              emptyText: hasSearch ? (
                <div className="py-8 text-center">
                  <p className="mb-2 text-sm text-muted-foreground">
                    No entries match &ldquo;<span className="font-medium text-foreground">{filterSearch}</span>&rdquo;
                  </p>
                  <button type="button" onClick={handleClearSearch} className="text-xs font-medium text-primary hover:underline">
                    Clear search filter
                  </button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">No entries yet. Click Add to create one.</span>
              ),
            }}
          />
        </div>
      </NewKvProvider>
    </PageShell>
  );
}
