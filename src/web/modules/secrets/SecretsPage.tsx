import { Button, EFormItemType, Empty, Modal, Pagination, Popconfirm, SchemaForm, type TFormItemProps, Table, message } from "@nonla-agents/ui";
import type { ColumnsType } from "@nonla-agents/ui";
import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { SecretEntry } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { SearchInput } from "src/components/SearchInput";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { createSecret, deleteSecret, fetchSecrets, updateSecret, updateSecretsFilter } from "./common/secretsSlice";

const PAGE_SIZE = 50;

type SecretValues = { key: string; value: string };

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
  const form = useForm<SecretValues>({ defaultValues: { key: edit?.key ?? "", value: "" }, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  const items: TFormItemProps[] = useMemo(
    () => [
      {
        type: EFormItemType.Input,
        name: "key",
        label: "Key",
        colSpan: 12,
        rules: {
          required: "Key is required",
          pattern: { value: "^[A-Z][A-Z0-9_]*$", message: "Key must match [A-Z][A-Z0-9_]* (e.g. API_TOKEN)" },
        },
        options: { placeholder: "API_TOKEN", autoFocus: true },
      },
      {
        type: EFormItemType.Input,
        name: "value",
        label: isEdit ? "New value (leave blank to keep)" : "Value",
        colSpan: 12,
        rules: isEdit ? undefined : { required: "Value is required" },
        options: { type: "password", placeholder: isEdit ? "••••••••" : "Secret value" },
      },
    ],
    [isEdit],
  );

  const onSubmit = form.handleSubmit(async ({ key, value }) => {
    const nextKey = key.trim().toUpperCase();
    setSaving(true);
    try {
      if (isEdit && edit) {
        const payload: Record<string, unknown> = { id: edit.id, key: nextKey };
        if (value) payload.value = value;
        await dispatch(updateSecret(payload)).unwrap();
        message.success("Updated");
      } else {
        await dispatch(createSecret({ key: nextKey, value })).unwrap();
        message.success("Created");
      }
      await dispatch(fetchSecrets());
      onClose();
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal open title={isEdit ? "Rotate secret" : "New secret"} onCancel={onClose} onOk={() => void onSubmit()} okText={isEdit ? "Save" : "Create"} confirmLoading={saving} destroyOnHidden>
      <p className="mb-3 text-sm text-muted-foreground">
        Encrypted at rest — value cannot be viewed again after save. Tools read via <code className="text-xs">nonlaagents.secrets.get(&quot;KEY&quot;)</code>.
      </p>
      <form onSubmit={onSubmit}>
        <SchemaForm
          form={form}
          items={items}
          valuesChangeDebounce={0}
          onValuesChange={(all) => {
            const upper = all.key.toUpperCase();
            if (upper !== all.key) form.setValue("key", upper);
          }}
        />
        {rootError ? <p className="mb-0 text-sm text-destructive">{rootError}</p> : null}
      </form>
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
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(400);

  const hasSearch = filterSearch.length > 0;
  const showTable = total > 0 || items.length > 0 || hasSearch;
  const showPagination = total > PAGE_SIZE;
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  useEffect(() => {
    dispatch(fetchSecrets());
  }, [dispatch]);

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

  const handleSearch = (q: string) => {
    if (q === filterSearch) return;
    dispatch(updateSecretsFilter({ search: q || undefined, page: 1 }));
    dispatch(fetchSecrets({ page: 1, search: q || undefined }));
  };

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
          <SearchInput onChange={handleSearch} placeholder="Search keys…" className="w-56" />
          <Button type="primary" icon={<AddCircleIcon size={16} />} onClick={() => setDialog("create")}>
            Add
          </Button>
        </div>
      </div>

      <RenderIf condition={showTable} fallback={<Empty className="rounded-xl border border-dashed border-border px-5 py-16" description="No secrets yet" />}>
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
