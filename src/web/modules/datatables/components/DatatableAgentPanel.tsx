import { AgentPanel, type AgentPanelEndpoint, type AgentStreamRequest, type AgentToolHook, type AgentToolResultEvent } from "devnonla-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { authorizedFetch } from "src/common/api";
import { SettingKey } from "src/common/enum";
import { SelectModel } from "src/components/chat/_components/SelectModel";
import { ensureLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { getSettingValues, saveSettingValues } from "src/modules/settings/common/settingsApi";
import { useAppDispatch, useAppSelector } from "src/store/store";

const MUTATING_TOOLS = ["datatable"] as const;

function toolResultMeta(output: unknown): { ok?: boolean; table?: unknown; column?: unknown; deleted?: unknown } | null {
  if (typeof output === "string") {
    try {
      return JSON.parse(output) as { ok?: boolean; table?: unknown; column?: unknown; deleted?: unknown };
    } catch {
      return null;
    }
  }
  if (output && typeof output === "object") {
    return output as { ok?: boolean; table?: unknown; column?: unknown; deleted?: unknown };
  }
  return null;
}

interface DatatableAgentPanelProps {
  projectId: string;
  onSchemaChanged: () => void;
  onGeneratingChange?: (generating: boolean) => void;
}

export function DatatableAgentPanel({ projectId, onSchemaChanged, onGeneratingChange }: DatatableAgentPanelProps) {
  const dispatch = useAppDispatch();
  const providerItems = useAppSelector((s) => s.llmProviders.items);
  const providersLoaded = useAppSelector((s) => s.llmProviders.items.length > 0 || s.llmProviders.total === 0);
  const [providerId, setProviderId] = useState<string | undefined>(undefined);
  const [model, setModel] = useState("");
  const providerInitRef = useRef(false);

  const providerIdRef = useRef(providerId);
  providerIdRef.current = providerId;
  const modelRef = useRef(model);
  modelRef.current = model;
  const onSchemaChangedRef = useRef(onSchemaChanged);
  onSchemaChangedRef.current = onSchemaChanged;
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void dispatch(ensureLlmProviders());
  }, [dispatch]);

  useEffect(() => {
    if (!providersLoaded || providerItems.length === 0) return;
    if (providerInitRef.current) return;
    providerInitRef.current = true;
    getSettingValues([SettingKey.DatatableAssistantProvider, SettingKey.DatatableAssistantModel]).then((s) => {
      const savedProvider = s[SettingKey.DatatableAssistantProvider] ?? "";
      const savedModel = s[SettingKey.DatatableAssistantModel] ?? "";
      const match = providerItems.find((p) => p.id === savedProvider) ?? providerItems[0];
      setProviderId(match.id);
      setModel(savedModel);
    });
  }, [providersLoaded, providerItems]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const handleModelChange = (pid: string, nextModel: string) => {
    setProviderId(pid);
    setModel(nextModel);
    void saveSettingValues({
      [SettingKey.DatatableAssistantProvider]: pid,
      [SettingKey.DatatableAssistantModel]: nextModel,
    });
  };

  const scheduleRefresh = (event: AgentToolResultEvent) => {
    if (event.error) return;
    const out = toolResultMeta(event.output);
    if (!out?.ok) return;
    if (!out.table && !out.column && !out.deleted) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      onSchemaChangedRef.current();
    }, 80);
  };

  const toolHooks: AgentToolHook[] = useMemo(
    () => [
      {
        name: MUTATING_TOOLS,
        onResult: scheduleRefresh,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId],
  );

  const endpoint: AgentPanelEndpoint = async ({ messages, signal }: AgentStreamRequest) => {
    const pid = providerIdRef.current;
    const mid = modelRef.current;
    if (!pid || !mid) throw new Error("Select a model to start chatting");
    return authorizedFetch(`/api/datatables/projects/${projectId}/agent/stream`, {
      method: "POST",
      body: JSON.stringify({
        providerId: pid,
        modelId: mid,
        messages,
        publicOrigin: window.location.origin,
      }),
      signal,
    });
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <AgentPanel
        endpoint={endpoint}
        placeholder={!providerId || !model ? "Select a model to start chatting" : "Describe schema or row changes…"}
        emptyState={<p className="m-auto max-w-52 px-6 py-8 text-center text-[13px] leading-relaxed text-muted-foreground">Create tables, add columns, or query and mutate rows.</p>}
        toolbar={<SelectModel providerId={providerId} model={model} onChange={handleModelChange} />}
        toolHooks={toolHooks}
        onGeneratingChange={onGeneratingChange}
      />
    </div>
  );
}
