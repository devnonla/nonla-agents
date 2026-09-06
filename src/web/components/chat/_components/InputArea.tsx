import { ChatInput } from "@nonla-agents/ui";
import { SelectModel } from "./SelectModel";
import { type ChatToolItem, SelectTools } from "./SelectTools";

interface InputAreaProps {
  generating: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
  onCancel: () => void;
  providerId?: string | null;
  model?: string;
  onModelChange?: (providerId: string, model: string) => void;
  hideConfig?: boolean;
  tools?: ChatToolItem[];
  toolsLoading?: boolean;
  focusSignal?: string | null;
  autoFocus?: boolean;
  enableTypeToFocus?: boolean;
  className?: string;
}

export function InputArea({ generating, placeholder = "", onSend, onCancel, providerId, model, onModelChange, hideConfig, tools, toolsLoading, focusSignal, autoFocus = false, enableTypeToFocus = true, className }: InputAreaProps) {
  const noModel = !hideConfig && !model;

  return (
    <ChatInput
      generating={generating}
      placeholder={noModel ? "Select a model to start chatting" : placeholder}
      disabled={noModel}
      onSend={onSend}
      onCancel={onCancel}
      autoFocus={autoFocus}
      focusSignal={focusSignal}
      enableTypeToFocus={enableTypeToFocus}
      className={className}
      toolbar={
        hideConfig ? undefined : (
          <>
            <SelectModel providerId={providerId} model={model} onChange={onModelChange} />
            {tools !== undefined ? <SelectTools tools={tools} loading={toolsLoading} /> : null}
          </>
        )
      }
    />
  );
}
