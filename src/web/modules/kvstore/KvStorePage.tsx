import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { KeyMinimalisticIcon } from "@solar-icons/react/dynamic/key-minimalistic";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { Alert, Button, Empty, Form, Input, Modal, Pagination, Popconfirm, Table, Tooltip, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useRef, useState } from "react";
import type { KvStoreEntry } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { createKvEntry, deleteKvEntry, fetchKvStore, updateKvEntry, updateKvStoreFilter } from "./common/kvStoreSlice";

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const PAGE_SIZE = 50;

interface FormState {
  key: string;
  value: string;
}

function EntryDialog({
  edit,
  onClose,
}: {
  edit?: KvStoreEntry | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const isEdit = !!edit;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>({
    key: edit?.key ?? "",
    value: edit?.value ?? "",
  });

  const handleSubmit = async () => {
    const key = form.key.trim();
    if (!KEY_RE.test(key)) {
      setError("Key must match [A-Z][A-Z0-9_]* (e.g. BASE_URL)");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit && edit) {
        await dispatch(updateKvEntry({ id: edit.id, key, value: form.value })).unwrap();
        message.success("Updated");
      } else {
        await dispatch(createKvEntry({ key, value: form.value })).unwrap();
        message.success("Created");
      }
      await dispatch(fetchKvStore());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={isEdit ? "Edit entry" : "New entry"} onCancel={onClose} onOk={handleSubmit} okText={isEdit ? "Save" : "Create"} confirmLoading={saving} destroyOnHidden>
      <RenderIf condition={!!error}>
        <Alert type="error" description={error} showIcon className="mb-3" />
      </RenderIf>
      <p className="mb-3 text-sm text-muted-foreground">
        Plaintext config for tools via <code className="text-xs">ctx.kv.get(&quot;KEY&quot;)</code>. Prefer Secrets for credentials.
      </p>
      <Form layout="vertical">
        <Form.Item label="Key" required>
          <Input autoFocus value={form.key} placeholder="BASE_URL" onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toUpperCase() }))} />
        </Form.Item>
        <Form.Item label="Value" required>
          <Input.TextArea rows={3} value={form.value} placeholder="https://api.example.com" onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function KvStorePage() {
  const dispatch = useAppDispatch();
  const items = useAppSelector((s) => s.kvStore.items) as KvStoreEntry[];
  const total = useAppSelector((s) => s.kvStore.total);
  const page = useAppSelector((s) => s.kvStore.filter.page) ?? 1;
  const filterSearch = useAppSelector((s) => s.kvStore.filter.search) ?? "";
  const [dialog, setDialog] = useState<"create" | KvStoreEntry | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(400);

  const hasSearch = searchInput.trim().length > 0 || filterSearch.length > 0;
  const showTable = total > 0 || items.length > 0 || hasSearch;
  const showPagination = total > PAGE_SIZE;
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  useEffect(() => {
    dispatch(fetchKvStore());
  }, [dispatch]);

  useEffect(() => {
    const q = searchInput.trim();
    if (q === filterSearch) return;
    const timer = setTimeout(() => {
      dispatch(updateKvStoreFilter({ search: q || undefined, page: 1 }));
      dispatch(fetchKvStore({ page: 1, search: q || undefined }));
    }, 300);
    return () => clearTimeout(timer);
  }, [dispatch, searchInput, filterSearch]);

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
      const header = (host.querySelector(".ant-table-header") as HTMLElement | null) ?? (host.querySelector(".ant-table-thead") as HTMLElement | null);
      const headerH = header?.offsetHeight ?? 39;
      setScrollY(Math.max(120, host.clientHeight - headerH));
    };

    const ro = new ResizeObserver(measure);
    ro.observe(host);
    measure();
    return () => ro.disconnect();
  }, [items.length]);

  const handlePageChange = (nextPage: number) => {
    dispatch(updateKvStoreFilter({ page: nextPage }));
    dispatch(fetchKvStore({ page: nextPage }));
  };

  const handleDelete = async (entry: KvStoreEntry) => {
    await dispatch(deleteKvEntry(entry.id)).unwrap();
    message.success("Deleted");
    await dispatch(fetchKvStore());
  };

  const columns: ColumnsType<KvStoreEntry> = [
    {
      title: "Key",
      dataIndex: "key",
      key: "key",
      width: 240,
      render: (v: string) => <code className="text-sm">{v}</code>,
    },
    {
      title: "Value",
      dataIndex: "value",
      key: "value",
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v.length > 80 ? v : undefined}>
          <span className="font-mono text-sm text-muted-foreground">{v}</span>
        </Tooltip>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 88,
      render: (_, row) => (
        <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <Button type="text" size="small" icon={<PenNewSquareIcon size={16} />} onClick={() => setDialog(row)} />
          <Popconfirm title={`Delete ${row.key}?`} description="Tools using this key will get null from nonlaagents.kv.get." okText="Delete" okType="danger" onConfirm={() => handleDelete(row)} styles={{ root: { width: 280 } }}>
            <Button type="text" size="small" danger icon={<TrashBinMinimalisticIcon size={16} />} />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <PageShell className="box-border flex h-full min-h-0 flex-col overflow-hidden" contentClassName="flex min-h-0 flex-1 flex-col">
      <div className="mb-6 flex shrink-0 items-center justify-between gap-4">
        <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">KV Store</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Input allowClear value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search…" prefix={<MagnifierIcon size={14} className="text-muted-foreground" />} className="w-56" />
          <Button type="primary" icon={<AddCircleIcon size={16} />} onClick={() => setDialog("create")}>
            Add
          </Button>
        </div>
      </div>

      <RenderIf
        condition={showTable}
        fallback={
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-5 py-16">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <KeyMinimalisticIcon size={28} />
            </div>
            <Empty description="No entries yet" />
          </div>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={tableHostRef} className="min-h-0 flex-1 overflow-hidden">
            <RenderIf
              condition={items.length > 0}
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Empty description="No matches" />
                </div>
              }
            >
              <Table rowKey="id" columns={columns} dataSource={items} scroll={{ y: scrollY }} pagination={false} size="small" onRow={() => ({ className: "group" })} />
            </RenderIf>
          </div>
          <RenderIf condition={showPagination}>
            <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border pt-3">
              <span className="text-xs tabular-nums text-muted-foreground">
                {rangeStart}–{rangeEnd} of {total}
              </span>
              <Pagination current={page} pageSize={PAGE_SIZE} total={total} size="small" showSizeChanger={false} itemRender={(_, type, element) => (type === "prev" || type === "next" ? null : element)} onChange={handlePageChange} />
            </div>
          </RenderIf>
        </div>
      </RenderIf>

      <RenderIf condition={dialog !== null}>
        <EntryDialog edit={dialog === "create" ? null : dialog} onClose={() => setDialog(null)} />
      </RenderIf>
    </PageShell>
  );
}
