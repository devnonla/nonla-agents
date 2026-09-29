import { AgentPanel, type AgentPanelEndpoint, type AgentStreamRequest, type AgentToolHook, type AgentToolResultEvent } from "devnonla-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { authorizedFetch } from "src/common/api";
import { SettingKey } from "src/common/enum";
import type { Job } from "src/common/types";
import { SelectModel } from "src/components/chat/_components/SelectModel";
import { ensureLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { getSettingValues, saveSettingValues } from "src/modules/settings/common/settingsApi";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { jobsApi } from "../../common/jobsApi";

const MUTATING_TOOLS = ["edit_code"] as const;

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

interface JobAgentPanelProps {
  jobId: string;
  onServerSync: (job: Job) => void;
  onGeneratingChange?: (generating: boolean) => void;
  onBeforeSend?: () => void | Promise<void>;
  onRunStarted?: () => void;
}

export function JobAgentPanel({ jobId, onServerSync, onGeneratingChange, onBeforeSend, onRunStarted }: JobAgentPanelProps) {
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
  const onRunStartedRef = useRef(onRunStarted);
  onRunStartedRef.current = onRunStarted;
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void dispatch(ensureLlmProviders());
  }, [dispatch]);

  useEffect(() => {
    if (!providersLoaded || providerItems.length === 0) return;
    if (providerInitRef.current) return;
    providerInitRef.current = true;
    getSettingValues([SettingKey.JobAssistantProvider, SettingKey.JobAssistantModel]).then((s) => {
      const savedProvider = s[SettingKey.JobAssistantProvider] ?? "";
      const savedModel = s[SettingKey.JobAssistantModel] ?? "";
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
      [SettingKey.JobAssistantProvider]: pid,
      [SettingKey.JobAssistantModel]: nextModel,
    });
  };

  const refreshFromServer = async () => {
    const t = await jobsApi.get(jobId);
    onServerSyncRef.current(t);
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
      {
        name: "run_current_job",
        onResult: () => {
          onRunStartedRef.current?.();
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobId],
  );

  const endpoint: AgentPanelEndpoint = async ({ messages, signal }: AgentStreamRequest) => {
    await onBeforeSendRef.current?.();
    const pid = providerIdRef.current;
    const mid = modelRef.current;
    if (!pid || !mid) throw new Error("Select a model to start chatting");
    return authorizedFetch(`/api/jobs/${jobId}/coding/stream`, {
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
        emptyState={<p className="m-auto max-w-52 px-6 py-8 text-center text-[13px] leading-relaxed text-muted-foreground">Describe a rewrite, fix, or new scheduled script. Changes land as a draft you can accept.</p>}
        toolbar={<SelectModel providerId={providerId} model={model} onChange={handleModelChange} />}
        toolHooks={toolHooks}
        onGeneratingChange={onGeneratingChange}
      />
    </div>
  );
}
