import type { ToolActionEvent } from "src/common/hooks/useAssistantStreaming";
import { AgentPanel } from "src/components/chat/_components/AgentPanel";
import { summarizeCodingToolCall } from "../../common/compactGenerateCodeHistory";

export type { ToolActionEvent };

interface CodingAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onToolAction: (event: ToolActionEvent) => void;
  onModelChange: (providerId: string, model: string) => void;
  assistantLabel?: string;
}

export function CodingAgentPanel({ providerId, model, streamUrl, onToolAction, onModelChange, assistantLabel = "Nonla Developer" }: CodingAgentPanelProps) {
  return <AgentPanel title={assistantLabel} emptyState="Describe a rewrite, fix, or new capability. Changes land as a draft you can accept." providerId={providerId} model={model} streamUrl={streamUrl} onModelChange={onModelChange} onToolAction={onToolAction} summarizeToolCall={summarizeCodingToolCall} resize />;
}
