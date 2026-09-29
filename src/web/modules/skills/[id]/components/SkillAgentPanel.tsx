import { AgentPanel, type AgentPanelEndpoint, type AgentStreamRequest, type AgentToolHook, type AgentToolResultEvent } from "devnonla-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { authorizedFetch } from "src/common/api";
import { SettingKey } from "src/common/enum";
import type { Skill, SkillReference } from "src/common/types";
import { SelectModel } from "src/components/chat/_components/SelectModel";
import { ensureLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { getSettingValues, saveSettingValues } from "src/modules/settings/common/settingsApi";
import { skillsApi } from "src/modules/skills/common/skillsApi";
import { useAppDispatch, useAppSelector } from "src/store/store";

const MUTATING_TOOLS = ["edit_skill_file", "delete_skill_file"] as const;

function toolResultMeta(output: unknown): { ok?: boolean; path?: string } | null {
  if (typeof output === "string") {
    try {
      return JSON.parse(output) as { ok?: boolean; path?: string };
    } catch {
      return null;
    }
  }
  if (output && typeof output === "object") return output as { ok?: boolean; path?: string };
  return null;
}

interface SkillAgentPanelProps {
  skillId: string;
  onServerSync: (skill: Skill, references: SkillReference[], hintPath?: string) => void;
  onGeneratingChange?: (generating: boolean) => void;
  onBeforeSend?: () => void | Promise<void>;
}

export function SkillAgentPanel({ skillId, onServerSync, onGeneratingChange, onBeforeSend }: SkillAgentPanelProps) {
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
  const hintPathRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    void dispatch(ensureLlmProviders());
  }, [dispatch]);

  useEffect(() => {
    if (!providersLoaded || providerItems.length === 0) return;
    if (providerInitRef.current) return;
    providerInitRef.current = true;
    getSettingValues([SettingKey.SkillAssistantProvider, SettingKey.SkillAssistantModel]).then((s) => {
      const savedProvider = s[SettingKey.SkillAssistantProvider] ?? "";
      const savedModel = s[SettingKey.SkillAssistantModel] ?? "";
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
      [SettingKey.SkillAssistantProvider]: pid,
      [SettingKey.SkillAssistantModel]: nextModel,
    });
  };

  const refreshFromServer = async (hintPath?: string) => {
    const [s, references] = await Promise.all([skillsApi.get(skillId), skillsApi.listReferences(skillId)]);
    onServerSyncRef.current(s, references, hintPath);
  };

  const scheduleRefresh = (event: AgentToolResultEvent) => {
    if (event.error) return;
    const out = toolResultMeta(event.output);
    if (!out?.ok) return;
    if (typeof out.path === "string") hintPathRef.current = out.path;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      const path = hintPathRef.current;
      hintPathRef.current = undefined;
      void refreshFromServer(path);
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
    [skillId],
  );

  const endpoint: AgentPanelEndpoint = async ({ messages, signal }: AgentStreamRequest) => {
    await onBeforeSendRef.current?.();
    const pid = providerIdRef.current;
    const mid = modelRef.current;
    if (!pid || !mid) throw new Error("Select a model to start chatting");
    return authorizedFetch(`/api/skills/${skillId}/assistant/stream`, {
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
        emptyState={<p className="m-auto max-w-52 px-6 py-8 text-center text-[13px] leading-relaxed text-muted-foreground">Rewrite instructions or add a reference. Changes land as a draft you can accept.</p>}
        toolbar={<SelectModel providerId={providerId} model={model} onChange={handleModelChange} />}
        toolHooks={toolHooks}
        onGeneratingChange={onGeneratingChange}
      />
    </div>
  );
}
