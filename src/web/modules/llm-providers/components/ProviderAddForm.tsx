import { Button, Form, Input, Select } from "antd";
import { useState } from "react";

import type { LlmProvider } from "src/common/types";
import { PROVIDER_OPTIONS, createLlmProvider, generateLabel, getProviderMeta } from "src/modules/llm-providers/common/llmProvidersSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

interface ProviderAddFormProps {
  onClose: () => void;
}

export function ProviderAddForm({ onClose }: ProviderAddFormProps) {
  const dispatch = useAppDispatch();

  const providers = useAppSelector((s) => s.llmProviders.items) as LlmProvider[];

  const [provider, setProvider] = useState("openai");
  const [label, setLabel] = useState(() => generateLabel("openai", providers));
  const [apiKey, setApiKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const meta = getProviderMeta(provider);
  const showCustomBaseUrl = meta.supportsCustomBaseUrl;

  const providerOptions = PROVIDER_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  }));

  const handleAdd = async () => {
    if (!label.trim() || !apiKey.trim()) {
      setError("Please fill in all required fields");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await dispatch(
        createLlmProvider({
          provider,
          label: label.trim(),
          apiKey,
          customBaseUrl: showCustomBaseUrl ? customBaseUrl.trim() : "",
          models: [],
        }),
      ).unwrap();

      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setError("");
    setApiKey("");
    setCustomBaseUrl("");
    onClose();
  };

  return (
    <div className="p-3.5 rounded-lg border border-border bg-muted/60">
      <div className="text-xs font-bold text-muted-foreground mb-3">New Provider</div>
      <div className="flex flex-col gap-3">
        <Form.Item label={<span className="text-muted-foreground">Provider</span>} className="mb-0!" layout="vertical">
          <Select
            value={provider}
            onChange={(v) => {
              const next = getProviderMeta(v);
              setProvider(v);
              setLabel(generateLabel(v, providers));
              if (!next.supportsCustomBaseUrl) setCustomBaseUrl("");
              setError("");
            }}
            options={providerOptions}
            className="w-full"
          />
        </Form.Item>
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
            id="settings-provider-label"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setError("");
            }}
            placeholder="e.g. My OpenAI Key"
          />
        </Form.Item>
        <Form.Item
          label={
            <span className="text-muted-foreground">
              API Key<span className="text-destructive"> *</span>
            </span>
          }
          className="mb-0!"
          layout="vertical"
        >
          <Input
            id="settings-provider-key"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setError("");
            }}
            placeholder={meta.keyPlaceholder}
            autoComplete="new-password"
          />
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
            <Input id="settings-provider-base-url" value={customBaseUrl} onChange={(e) => setCustomBaseUrl(e.target.value)} placeholder={meta.defaultBase || "https://…"} />
          </Form.Item>
        )}
        {error && <div className="text-2xs text-destructive font-medium">{error}</div>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="text" size="small" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="primary" size="small" loading={saving} onClick={handleAdd}>
            {saving ? "Adding…" : "Add Provider"}
          </Button>
        </div>
      </div>
    </div>
  );
}
