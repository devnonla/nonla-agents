import { message } from "@nonla-agents/ui";
import { useCallback, useEffect, useState } from "react";
import { SettingKey } from "src/common/enum";
import { ModelPicker } from "src/components/ModelPicker";
import { SectionRow } from "src/components/SectionRow";
import { ensureLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { getSettingValues, saveSettingValues } from "src/modules/settings/common/settingsApi";
import { useAppDispatch } from "src/store/store";

type AssistantModelConfig = {
  id: string;
  title: string;
  description: string;
  providerKey: SettingKey;
  modelKey: SettingKey;
};

const ASSISTANT_MODELS: AssistantModelConfig[] = [
  {
    id: "prompt",
    title: "Prompt assistant",
    description: "Default model when editing an agent system prompt.",
    providerKey: SettingKey.PromptAssistantProvider,
    modelKey: SettingKey.PromptAssistantModel,
  },
  {
    id: "tool",
    title: "Tool assistant",
    description: "Default model when coding or editing tools.",
    providerKey: SettingKey.ToolAssistantProvider,
    modelKey: SettingKey.ToolAssistantModel,
  },
  {
    id: "skill",
    title: "Skill assistant",
    description: "Default model when editing skills.",
    providerKey: SettingKey.SkillAssistantProvider,
    modelKey: SettingKey.SkillAssistantModel,
  },
  {
    id: "job",
    title: "Job assistant",
    description: "Default model when editing scheduled jobs.",
    providerKey: SettingKey.JobAssistantProvider,
    modelKey: SettingKey.JobAssistantModel,
  },
  {
    id: "site",
    title: "Site assistant",
    description: "Default model when editing sites.",
    providerKey: SettingKey.SiteAssistantProvider,
    modelKey: SettingKey.SiteAssistantModel,
  },
  {
    id: "datatable",
    title: "Datatable assistant",
    description: "Default model when editing datatable schemas.",
    providerKey: SettingKey.DatatableAssistantProvider,
    modelKey: SettingKey.DatatableAssistantModel,
  },
];

const ALL_KEYS = ASSISTANT_MODELS.flatMap((c) => [c.providerKey, c.modelKey]);

type ModelSelection = { providerId: string; model: string };

export function DefaultModelsPage() {
  const dispatch = useAppDispatch();
  const [selections, setSelections] = useState<Record<string, ModelSelection>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void dispatch(ensureLlmProviders());
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSettingValues(ALL_KEYS)
      .then((s) => {
        if (cancelled) return;
        const next: Record<string, ModelSelection> = {};
        for (const cfg of ASSISTANT_MODELS) {
          next[cfg.id] = {
            providerId: s[cfg.providerKey] ?? "",
            model: s[cfg.modelKey] ?? "",
          };
        }
        setSelections(next);
      })
      .catch(() => {
        if (!cancelled) message.error("Failed to load default models");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback(async (cfg: AssistantModelConfig, providerId: string, model: string) => {
    setSelections((prev) => ({
      ...prev,
      [cfg.id]: { providerId, model },
    }));
    try {
      await saveSettingValues({
        [cfg.providerKey]: providerId,
        [cfg.modelKey]: model,
      });
      message.success(`${cfg.title} saved`);
    } catch {
      message.error(`Failed to save ${cfg.title.toLowerCase()}`);
    }
  }, []);

  return (
    <div className="divide-y divide-border-subtle">
      {ASSISTANT_MODELS.map((cfg) => {
        const sel = selections[cfg.id] ?? { providerId: "", model: "" };
        return (
          <SectionRow key={cfg.id} title={cfg.title} description={cfg.description}>
            <div className="max-w-sm">
              <ModelPicker selectedProviderId={sel.providerId || null} selectedModel={sel.model} onChange={(providerId, model) => void handleChange(cfg, providerId, model)} disabled={loading} placeholder={loading ? "Loading…" : "Select model…"} />
            </div>
          </SectionRow>
        );
      })}
    </div>
  );
}
