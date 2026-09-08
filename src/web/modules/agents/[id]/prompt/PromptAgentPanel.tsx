import { AgentPanel } from "src/components/chat/_components/AgentPanel";

interface PromptAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onModelChange: (providerId: string, model: string) => void;
  onGeneratingChange?: (generating: boolean) => void;
  onBeforeSend?: () => void | Promise<void>;
}

export function PromptAgentPanel({ providerId, model, streamUrl, onModelChange, onGeneratingChange, onBeforeSend }: PromptAgentPanelProps) {
  return <AgentPanel title="Nonla Prompt Writer" emptyState="Describe the agent or the change — a draft appears for you to approve." providerId={providerId} model={model} streamUrl={streamUrl} onModelChange={onModelChange} onGeneratingChange={onGeneratingChange} onBeforeSend={onBeforeSend} />;
}
