import { AltArrowDownIcon } from "@solar-icons/react/dynamic/alt-arrow-down";
import { AltArrowUpIcon } from "@solar-icons/react/dynamic/alt-arrow-up";
import { RefreshIcon } from "@solar-icons/react/dynamic/refresh";
import { Button, Form, Input, Modal } from "antd";

import { useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import type { LlmProvider } from "src/common/types";
import { ProviderIcon } from "src/components/ProviderIcon";
import { deleteLlmProvider, getProviderMeta, refreshModels, updateLlmProvider } from "src/modules/llm-providers/common/llmProvidersSlice";
import { useAppDispatch } from "src/store/store";

interface ProviderListItemProps {
  item: LlmProvider;
}

export function ProviderListItem({ item }: ProviderListItemProps) {
  const dispatch = useAppDispatch();

  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [detail, setDetail] = useState<LlmProvider | null>(null);
  const [draft, setDraft] = useState({
    label: item.label,
    apiKey: "",
    customBaseUrl: "",
  });

  const meta = getProviderMeta(item.provider);
  const showCustomBaseUrl = meta.supportsCustomBaseUrl;
  const models: string[] = Array.isArray(detail?.models) ? detail.models : [];
  const modelCount = models.length || (item as { countModels?: number }).countModels || 0;
  const masked = item.maskedApiKey || (item.hasApiKey ? "••••••••" : "");

  useEffect(() => {
    if (expanded && !detail) {
      apiClient.get<LlmProvider>(`/api/providers/${item.id}`).then((res) => {
        setDetail(res);
        setDraft({
          label: res.label,
          apiKey: "",
          customBaseUrl: res.customBaseUrl ?? "",
        });
      });
    }
  }, [expanded, detail, item.id]);

  const handleSave = async () => {
    if (!draft.label.trim()) return;
    setSaving(true);
    try {
      const payload: { id: string; label: string; customBaseUrl: string; apiKey?: string } = {
        id: item.id,
        label: draft.label,
        customBaseUrl: showCustomBaseUrl ? draft.customBaseUrl : "",
      };
      if (draft.apiKey.trim()) payload.apiKey = draft.apiKey.trim();
      await dispatch(updateLlmProvider(payload)).unwrap();
      setExpanded(false);
    } catch (err: unknown) {
      console.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraft({
      label: detail?.label ?? item.label,
      apiKey: "",
      customBaseUrl: detail?.customBaseUrl ?? "",
    });
    setExpanded(false);
  };

  const handleRefreshModels = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await dispatch(refreshModels(item.id)).unwrap();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: "Delete this item?",
      content: `Remove "${item.label}" and all its configuration.`,
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => dispatch(deleteLlmProvider(item.id)),
    });
  };

  return (
    <div className={["rounded-lg border overflow-hidden transition-all duration-200", expanded ? "border-border bg-card" : "border-border bg-card hover:border-border"].join(" ")}>
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex items-center gap-3 px-3 py-2.5 w-full cursor-pointer bg-transparent hover:bg-muted text-left transition-colors outline-none border-none">
        <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
          <ProviderIcon provider={item.provider} size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{item.label}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground font-mono truncate select-none">{masked}</span>
            {modelCount > 0 && (
              <span className="text-2xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 font-medium shrink-0">
                {modelCount} model{modelCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground">{expanded ? <AltArrowUpIcon className="w-3.5 h-3.5" /> : <AltArrowDownIcon className="w-3.5 h-3.5" />}</span>
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 px-3.5 pb-3.5 pt-3 border-t border-border bg-muted/50">
          <Form.Item
            label={
              <span className="text-muted-foreground">
                Label<span className="text-destructive"> *</span>
              </span>
            }
            className="mb-0!"
            layout="vertical"
          >
            <Input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder={meta.label} />
          </Form.Item>

          <Form.Item
            label={
              <span className="text-muted-foreground">
                New API Key <span className="font-normal text-muted-foreground">(leave blank to keep)</span>
              </span>
            }
            className="mb-0!"
            layout="vertical"
          >
            <Input.Password value={draft.apiKey} onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))} placeholder="••••••••" visibilityToggle={false} autoComplete="new-password" />
          </Form.Item>

          {showCustomBaseUrl && (
            <Form.Item
              label={
                <span className="text-muted-foreground">
                  Base URL <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
              }
              className="mb-0!"
              layout="vertical"
            >
              <Input value={draft.customBaseUrl} onChange={(e) => setDraft((d) => ({ ...d, customBaseUrl: e.target.value }))} placeholder={meta.defaultBase || "https://…"} />
            </Form.Item>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-muted-foreground">Models{models.length > 0 ? ` (${models.length})` : ""}</span>
              <Button type="text" size="small" loading={refreshing} icon={<RefreshIcon size={11} />} onClick={handleRefreshModels}>
                Refresh
              </Button>
            </div>

            <div className="rounded-xl bg-card overflow-hidden">
              {refreshError && <div className="px-3 py-2 text-2xs text-destructive bg-destructive/5 border-b border-destructive/20">{refreshError}</div>}
              {models.length > 0 ? (
                <div className="max-h-40 overflow-y-auto divide-y divide-border/40">
                  {models.map((m) => (
                    <div key={m} className="px-3 py-1.5 text-xs text-foreground truncate" title={m}>
                      {m}
                    </div>
                  ))}
                </div>
              ) : (
                !refreshing && <div className="p-3 text-xs text-muted-foreground text-center">No models — click Refresh</div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button type="primary" danger size="small" onClick={handleDelete}>
              Delete
            </Button>

            <div className="flex gap-2">
              <Button type="text" size="small" onClick={handleDiscard}>
                Cancel
              </Button>

              <Button type="primary" size="small" loading={saving} onClick={handleSave}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
