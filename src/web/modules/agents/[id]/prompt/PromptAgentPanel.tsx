import { useEffect, useRef } from "react";
import { useAssistantStreaming } from "src/common/hooks/useAssistantStreaming";
import { AgentPanelComposer } from "src/components/chat/_components/AgentPanelComposer";
import { AgentPanelEmptyState } from "src/components/chat/_components/AgentPanelEmptyState";
import { AgentPanelHeader } from "src/components/chat/_components/AgentPanelHeader";
import { InputArea } from "src/components/chat/_components/InputArea";
import { MessageList } from "src/components/chat/_components/MessageList";
import { useAutoScroll } from "src/components/chat/hooks/useAutoScroll";

interface PromptAgentPanelProps {
  providerId: string | undefined;
  model: string;
  streamUrl: string;
  onModelChange: (providerId: string, model: string) => void;
  onGeneratingChange?: (generating: boolean) => void;
  onBeforeSend?: () => void | Promise<void>;
}

export function PromptAgentPanel({ providerId, model, streamUrl, onModelChange, onGeneratingChange, onBeforeSend }: PromptAgentPanelProps) {
  const { messages, generating, send, cancel, clear } = useAssistantStreaming({ streamUrl });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { scrollRef: scrollContainerRef, scrollToBottom } = useAutoScroll();

  useEffect(() => {
    onGeneratingChange?.(generating);
  }, [generating, onGeneratingChange]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#1e1e1e]">
      <AgentPanelHeader title="Nonla Prompt Writer" onNewChat={clear} />

      <AgentPanelComposer
        input={
          <InputArea
            generating={generating}
            placeholder="Describe what to change…"
            onSend={(text) => {
              if (!providerId || !model) return;
              scrollToBottom({ force: true });
              void (async () => {
                await onBeforeSend?.();
                void send(text, { providerId, model });
              })();
            }}
            onCancel={cancel}
            providerId={providerId}
            model={model}
            onModelChange={onModelChange}
            enableTypeToFocus={false}
          />
        }
        messages={
          <MessageList
            messages={messages}
            generating={generating}
            assistantLabel="Nonla Prompt Writer"
            emptyStateContent={<AgentPanelEmptyState>Describe the agent or the change — a draft appears for you to approve.</AgentPanelEmptyState>}
            messagesEndRef={messagesEndRef}
            scrollContainerRef={scrollContainerRef}
            className="selectable"
          />
        }
      />
    </div>
  );
}
