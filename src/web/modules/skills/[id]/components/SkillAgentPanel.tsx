import type { ToolActionEvent } from "src/common/hooks/useAssistantStreaming";
import { AgentPanel } from "src/components/chat/_components/AgentPanel";
import type { ChatAgentMessage } from "src/components/chat/common/types";

export type { ToolActionEvent };

function summarizeSkillToolCall(m: ChatAgentMessage): string | null {
  if (m.toolName === "read_skill_file") {
    const input = m.toolInput as { path?: string } | undefined;
    return `read ${input?.path ?? "file"}`;
  }
  if (m.toolName === "edit_skill_file") {
    const input = m.toolInput as { path?: string; mode?: string } | undefined;
    return `edit ${input?.path ?? "file"} (${input?.mode ?? "…"})`;
  }
  if (m.toolName === "delete_skill_file") {
    const input = m.toolInput as { path?: string } | undefined;
    return `delete ${input?.path ?? "file"}`;
  }
  return null;
}

interface SkillAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onToolAction: (event: ToolActionEvent) => void;
  onModelChange: (providerId: string, model: string) => void;
  onGeneratingChange?: (generating: boolean) => void;
  onBeforeSend?: () => void | Promise<void>;
}

export function SkillAgentPanel({ providerId, model, streamUrl, onToolAction, onModelChange, onGeneratingChange, onBeforeSend }: SkillAgentPanelProps) {
  return (
    <AgentPanel
      title="Nonla Skill Writer"
      emptyState="Rewrite instructions or add a reference. Changes land as a draft you can accept."
      providerId={providerId}
      model={model}
      streamUrl={streamUrl}
      onModelChange={onModelChange}
      onToolAction={onToolAction}
      summarizeToolCall={summarizeSkillToolCall}
      onGeneratingChange={onGeneratingChange}
      onBeforeSend={onBeforeSend}
      resize
    />
  );
}
