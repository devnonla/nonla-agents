import { message } from "devnonla-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SecretEntry } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { createSecret, deleteSecret, fetchSecrets, updateSecret, updateSecretsFilter } from "./common/secretsSlice";
import type { NewSecretRowHandle } from "./components/NewSecretRow";
import { SecretsTable } from "./components/SecretsTable";
import { SecretsToolbar } from "./components/SecretsToolbar";

const PAGE_SIZE = 50;

export default function SecretsPage() {
  const dispatch = useAppDispatch();
  const items = useAppSelector((s) => s.secrets.items) as SecretEntry[];
  const total = useAppSelector((s) => s.secrets.total);
  const page = useAppSelector((s) => s.secrets.filter.page) ?? 1;
  const filterSearch = useAppSelector((s) => s.secrets.filter.search) ?? "";

  const newSecretRef = useRef<NewSecretRowHandle>(null);
  const [adding, setAdding] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  const hasSearch = filterSearch.length > 0;

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

  const handleSearch = useCallback(
    (q: string) => {
      if (q === filterSearch) return;
      dispatch(updateSecretsFilter({ search: q || undefined, page: 1 }));
      dispatch(fetchSecrets({ page: 1, search: q || undefined }));
    },
    [dispatch, filterSearch],
  );

  const handleClearSearch = useCallback(() => {
    dispatch(updateSecretsFilter({ search: undefined, page: 1 }));
    dispatch(fetchSecrets({ page: 1, search: undefined }));
  }, [dispatch]);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      dispatch(updateSecretsFilter({ page: nextPage }));
      dispatch(fetchSecrets({ page: nextPage }));
    },
    [dispatch],
  );

  // --- Mutation Handlers ---
  const handleUpdate = useCallback(
    async (id: string, patch: { key?: string; value?: string }) => {
      try {
        await dispatch(updateSecret({ id, ...patch })).unwrap();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error(msg);
        throw err;
      }
    },
    [dispatch],
  );

  const handleDeleteSelected = useCallback(async () => {
    const ids = selectedRowKeys;
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map((id) => dispatch(deleteSecret(id)).unwrap()));
    const failed = results.filter((r) => r.status === "rejected").length;
    setSelectedRowKeys([]);
    if (failed === 0) message.success(ids.length === 1 ? "Deleted" : `Deleted ${ids.length}`);
    else message.error(failed === ids.length ? "Delete failed" : `Deleted ${ids.length - failed}, ${failed} failed`);
    await dispatch(fetchSecrets());
  }, [dispatch, selectedRowKeys]);

  const handleCreate = useCallback(
    async (payload: { key: string; value: string }) => {
      try {
        await dispatch(createSecret(payload)).unwrap();
        message.success(`Created ${payload.key}`);
        setAdding(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error(msg);
        throw err;
      }
    },
    [dispatch],
  );

  const handleAddClick = useCallback(() => {
    if (adding) {
      newSecretRef.current?.focusKey();
      return;
    }
    setAdding(true);
  }, [adding]);

  return (
    <PageShell className="box-border flex h-full min-h-0 flex-col overflow-hidden pt-4" contentClassName="flex min-h-0 flex-1 flex-col">
      <SecretsToolbar search={filterSearch} onSearchChange={handleSearch} onAddClick={handleAddClick} selectedCount={selectedRowKeys.length} onDeleteSelected={handleDeleteSelected} />

      <SecretsTable
        items={items}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={handlePageChange}
        onUpdate={handleUpdate}
        onCreate={handleCreate}
        selectedRowKeys={selectedRowKeys}
        onSelectedRowKeysChange={setSelectedRowKeys}
        newSecretRef={newSecretRef}
        adding={adding}
        onCancelAdd={() => setAdding(false)}
        hasSearch={hasSearch}
        searchQuery={filterSearch}
        onClearSearch={handleClearSearch}
      />
    </PageShell>
  );
}
