import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { LockPasswordIcon } from "@solar-icons/react/dynamic/lock-password";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { Alert, Button, Empty, Form, Input, Modal, Pagination, Popconfirm, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useRef, useState } from "react";
import type { SecretEntry } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { createSecret, deleteSecret, fetchSecrets, updateSecret, updateSecretsFilter } from "./common/secretsSlice";

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const PAGE_SIZE = 50;

interface FormState {
  key: string;
  value: string;
}

function SecretDialog({
  edit,
  onClose,
}: {
  edit?: SecretEntry | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const isEdit = !!edit;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>({
    key: edit?.key ?? "",
    value: "",
  });

  const handleSubmit = async () => {
    const key = form.key.trim();
    if (!KEY_RE.test(key)) {
      setError("Key must match [A-Z][A-Z0-9_]* (e.g. API_TOKEN)");
      return;
    }
    if (!isEdit && !form.value) {
      setError("Value is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit && edit) {
        const payload: Record<string, unknown> = { id: edit.id, key };
        if (form.value) payload.value = form.value;
        await dispatch(updateSecret(payload)).unwrap();
        message.success("Updated");
      } else {
        await dispatch(createSecret({ key, value: form.value })).unwrap();
        message.success("Created");
      }
      await dispatch(fetchSecrets());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={isEdit ? "Rotate secret" : "New secret"} onCancel={onClose} onOk={handleSubmit} okText={isEdit ? "Save" : "Create"} confirmLoading={saving} destroyOnHidden>
      <RenderIf condition={!!error}>
        <Alert type="error" description={error} showIcon className="mb-3" />
      </RenderIf>
      <p className="mb-3 text-sm text-muted-foreground">
        Encrypted at rest — value cannot be viewed again after save. Tools read via <code className="text-xs">nonlaagents.secrets.get(&quot;KEY&quot;)</code>.
      </p>
      <Form layout="vertical">
        <Form.Item label="Key" required>
          <Input autoFocus value={form.key} placeholder="API_TOKEN" onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toUpperCase() }))} />
        </Form.Item>
        <Form.Item label={isEdit ? "New value (leave blank to keep)" : "Value"} required={!isEdit}>
          <Input.Password value={form.value} placeholder={isEdit ? "••••••••" : "Secret value"} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function SecretsPage() {
  const dispatch = useAppDispatch();
  const items = useAppSelector((s) => s.secrets.items) as SecretEntry[];
  const total = useAppSelector((s) => s.secrets.total);
  const page = useAppSelector((s) => s.secrets.filter.page) ?? 1;
  const filterSearch = useAppSelector((s) => s.secrets.filter.search) ?? "";
  const [dialog, setDialog] = useState<"create" | SecretEntry | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(400);

  const hasSearch = searchInput.trim().length > 0 || filterSearch.length > 0;
  const showTable = total > 0 || items.length > 0 || hasSearch;
  const showPagination = total > PAGE_SIZE;
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  useEffect(() => {
    dispatch(fetchSecrets());
  }, [dispatch]);

  useEffect(() => {
    const q = searchInput.trim();
    if (q === filterSearch) return;
    const timer = setTimeout(() => {
      dispatch(updateSecretsFilter({ search: q || undefined, page: 1 }));
      dispatch(fetchSecrets({ page: 1, search: q || undefined }));
    }, 300);
    return () => clearTimeout(timer);
  }, [dispatch, searchInput, filterSearch]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
    if (page > maxPage) {
      dispatch(updateSecretsFilter({ page: maxPage }));
      dispatch(fetchSecrets({ page: maxPage }));
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
    dispatch(updateSecretsFilter({ page: nextPage }));
    dispatch(fetchSecrets({ page: nextPage }));
  };

  const handleDelete = async (entry: SecretEntry) => {
    await dispatch(deleteSecret(entry.id)).unwrap();
    message.success("Deleted");
    await dispatch(fetchSecrets());
  };

  const columns: ColumnsType<SecretEntry> = [
    {
      title: "Key",
      dataIndex: "key",
      key: "key",
      render: (v: string) => <code className="text-sm">{v}</code>,
    },
    {
      title: "Value",
      key: "value",
      width: 120,
      render: () => <span className="font-mono text-sm tracking-wider text-muted-foreground select-none">••••••••••••</span>,
    },
    {
      title: "",
      key: "actions",
      width: 88,
      render: (_, row) => (
        <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <Button type="text" size="small" icon={<PenNewSquareIcon size={16} />} onClick={() => setDialog(row)} />
          <Popconfirm title={`Delete ${row.key}?`} description="This cannot be undone. Tools using this secret will no longer receive a value." okText="Delete" okType="danger" onConfirm={() => handleDelete(row)} styles={{ root: { width: 280 } }}>
            <Button type="text" size="small" danger icon={<TrashBinMinimalisticIcon size={16} />} />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <PageShell className="box-border flex h-full min-h-0 flex-col overflow-hidden" contentClassName="flex min-h-0 flex-1 flex-col">
      <div className="mb-6 flex shrink-0 items-center justify-between gap-4">
        <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Secrets</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Input allowClear value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search keys…" prefix={<MagnifierIcon size={14} className="text-muted-foreground" />} className="w-56" />
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
              <LockPasswordIcon size={28} />
            </div>
            <Empty description="No secrets yet" />
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
        <SecretDialog edit={dialog === "create" ? null : dialog} onClose={() => setDialog(null)} />
      </RenderIf>
    </PageShell>
  );
}
