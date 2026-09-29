import { AgentPanel, type AgentPanelEndpoint, type AgentStreamRequest, type AgentToolHook, type AgentToolResultEvent } from "devnonla-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiClient, authorizedFetch } from "src/common/api";
import { SettingKey } from "src/common/enum";
import type { Agent } from "src/common/types";
import { SelectModel } from "src/components/chat/_components/SelectModel";
import { ensureLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { getSettingValues, saveSettingValues } from "src/modules/settings/common/settingsApi";
import { useAppDispatch, useAppSelector } from "src/store/store";

const MUTATING_TOOLS = ["generate_prompt"] as const;

function toolResultMeta(output: unknown): { ok?: boolean } | null {
  if (typeof output === "string") {
    try {
      return JSON.parse(output) as { ok?: boolean };
    } catch {
      return null;
    }
  }
  if (output && typeof output === "object") return output as { ok?: boolean };
  return null;
}

interface PromptAgentPanelProps {
  agentId: string;
  onServerSync: (agent: Agent) => void;
  onGeneratingChange?: (generating: boolean) => void;
  onBeforeSend?: () => void | Promise<void>;
}

export function PromptAgentPanel({ agentId, onServerSync, onGeneratingChange, onBeforeSend }: PromptAgentPanelProps) {
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
  const onBeforeSendRef = useRef(onBeforeSend);
  onBeforeSendRef.current = onBeforeSend;
  const onServerSyncRef = useRef(onServerSync);
  onServerSyncRef.current = onServerSync;
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void dispatch(ensureLlmProviders());
  }, [dispatch]);

  useEffect(() => {
    if (!providersLoaded || providerItems.length === 0) return;
    if (providerInitRef.current) return;
    providerInitRef.current = true;
    getSettingValues([SettingKey.PromptAssistantProvider, SettingKey.PromptAssistantModel]).then((s) => {
      const savedProvider = s[SettingKey.PromptAssistantProvider] ?? "";
      const savedModel = s[SettingKey.PromptAssistantModel] ?? "";
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
      [SettingKey.PromptAssistantProvider]: pid,
      [SettingKey.PromptAssistantModel]: nextModel,
    });
  };

  const refreshFromServer = async () => {
    const a = await apiClient.get<Agent>(`/api/agents/${agentId}`);
    onServerSyncRef.current(a);
  };

  const scheduleRefresh = (event: AgentToolResultEvent) => {
    if (event.error) return;
    const out = toolResultMeta(event.output);
    if (!out?.ok) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      void refreshFromServer();
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
    [agentId],
  );

  const endpoint: AgentPanelEndpoint = async ({ messages, signal }: AgentStreamRequest) => {
    await onBeforeSendRef.current?.();
    const pid = providerIdRef.current;
    const mid = modelRef.current;
    if (!pid || !mid) throw new Error("Select a model to start chatting");
    return authorizedFetch(`/api/agents/${agentId}/assistant/prompt/stream`, {
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
        placeholder={!providerId || !model ? "Select a model to start chatting" : "Describe what to change…"}
        emptyState={<p className="m-auto max-w-52 px-6 py-8 text-center text-[13px] leading-relaxed text-muted-foreground">Describe the agent or the change — a draft appears for you to approve.</p>}
        toolbar={<SelectModel providerId={providerId} model={model} onChange={handleModelChange} />}
        toolHooks={toolHooks}
        onGeneratingChange={onGeneratingChange}
      />
    </div>
  );
}
