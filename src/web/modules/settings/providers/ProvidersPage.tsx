import { AddIcon } from "@solar-icons/react/dynamic/add";
import { KeyIcon } from "@solar-icons/react/dynamic/key";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { RefreshIcon } from "@solar-icons/react/dynamic/refresh";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { Button, Form, Input, Modal, Select, Skeleton, Tag, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "src/common/api";
import type { LlmProvider } from "src/common/types";
import { ProviderIcon } from "src/components/ProviderIcon";
import { RawButton } from "src/components/RawButton";
import RenderIf from "src/components/RenderIf";
import { PROVIDER_OPTIONS, createLlmProvider, deleteLlmProvider, generateLabel, getProviderMeta, refreshModels, updateLlmProvider } from "src/modules/llm-providers/common/llmProvidersSlice";
import { ProviderEmptyState } from "src/modules/llm-providers/components/ProviderEmptyState";
import { useAppDispatch, useAppSelector } from "src/store/store";

// ─── Add / Edit Dialog ───────────────────────────────────────────────────────

interface ProviderFormDialogProps {
  editId?: string;
  onClose: () => void;
}

function ProviderFormDialog({ editId, onClose }: ProviderFormDialogProps) {
  const dispatch = useAppDispatch();
  const providers = useAppSelector((s) => s.llmProviders.items) as LlmProvider[];
  const isEdit = !!editId;

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    provider: "openai",
    label: generateLabel("openai", providers),
    apiKey: "",
    customBaseUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    apiClient
      .get<LlmProvider>(`/api/providers/${editId}`)
      .then((detail) => {
        setForm({
          provider: detail.provider,
          label: detail.label,
          apiKey: "",
          customBaseUrl: detail.customBaseUrl ?? "",
        });
      })
      .catch(() => {
        message.error("Failed to load provider details");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [editId, onClose]);

  const providerOptions = PROVIDER_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  }));

  const meta = getProviderMeta(form.provider);
  const showCustomBaseUrl = meta.supportsCustomBaseUrl;

  const handleSubmit = async () => {
    if (!form.label.trim()) {
      setError("Please fill in all required fields");
      return;
    }
    if (!isEdit && !form.apiKey.trim()) {
      setError("Please fill in all required fields");
      return;
    }
    setSaving(true);
    setError("");
    const customBaseUrl = showCustomBaseUrl ? form.customBaseUrl.trim() : "";
    try {
      if (isEdit) {
        const payload: { id: string; label: string; customBaseUrl: string; apiKey?: string } = {
          id: editId,
          label: form.label.trim(),
          customBaseUrl,
        };
        if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
        await dispatch(updateLlmProvider(payload)).unwrap();
        message.success(`Provider "${form.label}" updated`);
      } else {
        await dispatch(
          createLlmProvider({
            provider: form.provider,
            label: form.label.trim(),
            apiKey: form.apiKey.trim(),
            customBaseUrl,
            models: [],
          }),
        ).unwrap();
        message.success(`Provider "${form.label}" added`);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onCancel={onClose}
      title={
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-field-sm w-field-sm shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <div className="text-[14px] leading-none text-muted-foreground">{isEdit ? <PenNewSquareIcon size={16} /> : <KeyIcon size={16} />}</div>
          </div>
          <span className="truncate font-semibold text-foreground">{isEdit ? "Edit Provider" : "Add Provider"}</span>
        </div>
      }
      width={560}
      style={{ top: 120 }}
      destroyOnHidden
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="text" size="small" onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" size="small" loading={saving} disabled={loading} onClick={handleSubmit}>
            {isEdit ? "Save" : "Add Provider"}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center h-40 gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {!isEdit && (
            <Form.Item label={<span className="text-muted-foreground">Provider</span>} className="mb-0!" layout="vertical">
              <Select
                value={form.provider}
                onChange={(v) => {
                  const next = getProviderMeta(v);
                  setForm((f) => ({
                    ...f,
                    provider: v,
                    label: generateLabel(v, providers),
                    customBaseUrl: next.supportsCustomBaseUrl ? f.customBaseUrl : "",
                  }));
                  setError("");
                }}
                options={providerOptions}
                className="w-full"
              />
            </Form.Item>
          )}

          <Form.Item
            label={
              <span className="text-muted-foreground">
                Label<span className="text-destructive"> *</span>
              </span>
            }
            className="mb-0!"
            layout="vertical"
          >
            <Input
              value={form.label}
              onChange={(e) => {
                setForm((f) => ({ ...f, label: e.target.value }));
                setError("");
              }}
              placeholder="e.g. My OpenAI Key"
            />
          </Form.Item>

          <Form.Item
            label={
              <span className="text-muted-foreground">
                {isEdit ? "New API Key" : "API Key"}
                {!isEdit && <span className="text-destructive"> *</span>}
                {isEdit && <span className="font-normal text-muted-foreground"> (leave blank to keep)</span>}
              </span>
            }
            className="mb-0!"
            layout="vertical"
          >
            <Input.Password
              value={form.apiKey}
              onChange={(e) => {
                setForm((f) => ({ ...f, apiKey: e.target.value }));
                setError("");
              }}
              placeholder={isEdit ? "••••••••" : meta.keyPlaceholder}
              visibilityToggle={false}
              autoComplete="new-password"
            />
          </Form.Item>

          <RenderIf condition={showCustomBaseUrl}>
            <Form.Item
              label={
                <span className="text-muted-foreground">
                  Base URL <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
              }
              className="mb-0!"
              layout="vertical"
            >
              <Input value={form.customBaseUrl} onChange={(e) => setForm((f) => ({ ...f, customBaseUrl: e.target.value }))} placeholder={meta.defaultBase || "https://…"} />
            </Form.Item>
          </RenderIf>

          <RenderIf condition={!!error}>
            <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-xs text-destructive font-medium">{error}</p>
            </div>
          </RenderIf>
        </div>
      )}
    </Modal>
  );
}

// ─── Delete Confirm Dialog ───────────────────────────────────────────────────

interface DeleteProviderDialogProps {
  provider: LlmProvider;
  onClose: () => void;
}

function DeleteProviderDialog({ provider, onClose }: DeleteProviderDialogProps) {
  const dispatch = useAppDispatch();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await dispatch(deleteLlmProvider(provider.id)).unwrap();
      message.success(`Deleted provider "${provider.label}"`);
      onClose();
    } catch (err: any) {
      message.error(err?.message || "Failed to delete provider");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open
      onCancel={onClose}
      title={
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-field-sm w-field-sm shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <div className="text-[14px] leading-none text-muted-foreground">
              <TrashBinMinimalisticIcon size={16} />
            </div>
          </div>
          <span className="truncate font-semibold text-foreground">Delete Provider</span>
        </div>
      }
      width={380}
      centered
      destroyOnHidden
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="text" size="small" onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" danger size="small" onClick={handleDelete} loading={deleting}>
            Delete
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted-foreground leading-relaxed">
        Remove <strong className="text-foreground">"{provider.label}"</strong> and all its configuration? This action cannot be undone.
      </p>
    </Modal>
  );
}

// ─── Models Dialog ───────────────────────────────────────────────────────────

interface ModelsDialogProps {
  provider: LlmProvider;
  onClose: () => void;
}

function ModelsDialog({ provider, onClose }: ModelsDialogProps) {
  const dispatch = useAppDispatch();
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get(`/api/providers/${provider.id}/models`)
      .then((list) => {
        if (!cancelled) setModels(Array.isArray(list) ? (list as string[]) : []);
      })
      .catch(() => {
        if (!cancelled) {
          message.error("Failed to load models");
          setModels([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.toLowerCase().includes(q));
  }, [models, search]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const updated = await dispatch(refreshModels(provider.id)).unwrap();
      setModels(Array.isArray(updated.models) ? updated.models : []);
      message.success("Models refreshed");
    } catch (err: any) {
      message.error(err?.message || "Failed to refresh models");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Modal
      open
      onCancel={onClose}
      title={
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-field-sm w-field-sm shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <div className="text-[14px] leading-none text-muted-foreground">
              <ProviderIcon provider={provider.provider} size={16} />
            </div>
          </div>
          <span className="truncate font-semibold text-foreground">{provider.label}</span>
        </div>
      }
      width={480}
      centered
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{loading ? "…" : `${filtered.length}${search.trim() ? ` / ${models.length}` : ""} model${filtered.length !== 1 ? "s" : ""}`}</span>
          <div className="flex items-center gap-2">
            <Button type="text" size="small" onClick={onClose}>
              Close
            </Button>
            <Button type="default" size="small" loading={refreshing} icon={<RefreshIcon />} onClick={handleRefresh}>
              Sync
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="relative">
          <MagnifierIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 z-1 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search models…" className="pl-8" autoFocus />
        </div>

        <div className="max-h-90 overflow-y-auto rounded-lg border border-border-subtle bg-muted/40">
          <RenderIf condition={loading}>
            <div className="flex flex-col gap-2 p-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton.Input key={i} active block className="h-7!" />
              ))}
            </div>
          </RenderIf>

          <RenderIf condition={!loading && filtered.length === 0}>
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">{models.length === 0 ? "No models synced yet — click Sync to fetch." : "No models match your search."}</div>
          </RenderIf>

          <RenderIf condition={!loading && filtered.length > 0}>
            {() => (
              <ul className="m-0 list-none divide-y divide-border-subtle p-0">
                {filtered.map((model) => (
                  <li key={model} className="px-3 py-2 font-mono text-xs text-foreground truncate" title={model}>
                    {model}
                  </li>
                ))}
              </ul>
            )}
          </RenderIf>
        </div>
      </div>
    </Modal>
  );
}

// ─── Provider Card ───────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: LlmProvider;
  refreshing: boolean;
  onRefresh: () => void;
  onViewModels: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ProviderCard({ provider, refreshing, onRefresh, onViewModels, onEdit, onDelete }: ProviderCardProps) {
  const meta = getProviderMeta(provider.provider);
  const modelCount = Array.isArray(provider.models) ? provider.models.length : (provider as any).countModels || 0;
  const masked = provider.maskedApiKey || "••••••••";

  return (
    <div className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border-subtle bg-card p-3.5 text-card-foreground transition-colors hover:border-border">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <ProviderIcon provider={provider.provider} size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-semibold leading-5 text-foreground">{provider.label}</p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">{meta.label}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5">
          <KeyIcon size={12} className="shrink-0 text-muted-foreground" />
          <code className="min-w-0 truncate font-mono text-xs text-tertiary-foreground">{masked}</code>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={onViewModels} className="cursor-pointer border-0 bg-transparent p-0">
              <Tag className="m-0! rounded-md tabular-nums hover:opacity-80 transition-opacity">
                {modelCount} model{modelCount !== 1 ? "s" : ""}
              </Tag>
            </button>
            <Button type="text" size="small" loading={refreshing} icon={<RefreshIcon />} onClick={onRefresh}>
              Sync
            </Button>
          </div>
          <div className="flex items-center gap-0.5">
            <Button type="text" size="small" icon={<PenNewSquareIcon />} onClick={onEdit} aria-label="Edit provider" />
            <Button type="text" size="small" icon={<TrashBinMinimalisticIcon />} onClick={onDelete} aria-label="Delete provider" className="text-destructive! hover:text-destructive!" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function ProvidersPage() {
  const dispatch = useAppDispatch();
  const providers = useAppSelector((s) => s.llmProviders.items) as LlmProvider[];

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [deleteProvider, setDeleteProvider] = useState<LlmProvider | null>(null);
  const [modelsProvider, setModelsProvider] = useState<LlmProvider | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const handleRefreshModels = async (id: string) => {
    setRefreshingId(id);
    try {
      await dispatch(refreshModels(id)).unwrap();
      message.success("Models refreshed");
    } catch (err: any) {
      message.error(err?.message || "Failed to refresh models");
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">LLM Providers</h1>
        <RawButton id="settings-add-provider" type="primary" icon={<AddIcon size={16} />} onClick={() => setShowAddDialog(true)}>
          Add Provider
        </RawButton>
      </div>

      <RenderIf condition={providers.length === 0}>
        <ProviderEmptyState />
      </RenderIf>

      <RenderIf condition={providers.length > 0}>
        {() => (
          <div className="grid gap-3 md:grid-cols-2">
            {providers.map((p) => (
              <ProviderCard key={p.id} provider={p} refreshing={refreshingId === p.id} onRefresh={() => handleRefreshModels(p.id)} onViewModels={() => setModelsProvider(p)} onEdit={() => setEditProviderId(p.id)} onDelete={() => setDeleteProvider(p)} />
            ))}
          </div>
        )}
      </RenderIf>

      <RenderIf condition={showAddDialog}>
        <ProviderFormDialog onClose={() => setShowAddDialog(false)} />
      </RenderIf>

      <RenderIf condition={!!editProviderId}>{() => <ProviderFormDialog editId={editProviderId!} onClose={() => setEditProviderId(null)} />}</RenderIf>

      <RenderIf condition={!!deleteProvider}>{() => <DeleteProviderDialog provider={deleteProvider as LlmProvider} onClose={() => setDeleteProvider(null)} />}</RenderIf>

      <RenderIf condition={!!modelsProvider}>{() => <ModelsDialog provider={modelsProvider as LlmProvider} onClose={() => setModelsProvider(null)} />}</RenderIf>
    </div>
  );
}
