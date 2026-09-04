import { Input } from "@nonla-agents/ui";
import type { TextAreaRef } from "@nonla-agents/ui";
import { useEffect, useRef, useState } from "react";

import { cn } from "src/common/lib/cn";
import RenderIf from "src/components/RenderIf";
import { SelectModel } from "./SelectModel";
import { type ChatToolItem, SelectTools } from "./SelectTools";

const chatComposerTextStyle = {
  fontSize: "var(--chat-composer-size)",
  lineHeight: "var(--chat-composer-leading)",
  fontFamily: "var(--font-family-chat)",
  fontWeight: 400 as const,
};

interface InputAreaProps {
  generating: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
  onCancel: () => void;
  providerId?: string | null;
  model?: string;
  onModelChange?: (providerId: string, model: string) => void;
  hideConfig?: boolean;
  /** Assigned tools to show next to the model picker (read-only list) */
  tools?: ChatToolItem[];
  toolsLoading?: boolean;
  /** When this changes (e.g. conversation id), focus the input */
  focusSignal?: string | null;
  /** Focus the input when this area mounts */
  autoFocus?: boolean;
  /** Redirect bare keypresses into this input when focus is elsewhere (default true) */
  enableTypeToFocus?: boolean;
  className?: string;
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return true;
  return Boolean(el.closest("input, textarea, select, [contenteditable], [role='dialog'], [role='alertdialog'], [role='listbox'], [role='menu'], .monaco-editor"));
}

function getNativeTextArea(ref: TextAreaRef | null): HTMLTextAreaElement | null {
  if (!ref) return null;
  return ref.resizableTextArea?.textArea ?? ref;
}

export function InputArea({ generating, placeholder = "", onSend, onCancel, providerId, model, onModelChange, hideConfig, tools, toolsLoading, focusSignal, autoFocus = false, enableTypeToFocus = true, className }: InputAreaProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<TextAreaRef>(null);
  const hasText = text.trim().length > 0;

  const noModel = !hideConfig && !model;
  const canSend = !generating && !noModel;
  const sendEnabled = hasText && canSend;

  useEffect(() => {
    const onSignal = focusSignal !== undefined;
    if (!autoFocus && !onSignal) return;
    if (onSignal) setText("");

    let tries = 0;
    let timer = 0;
    const tryFocus = () => {
      const api = textareaRef.current;
      const ta = getNativeTextArea(api);
      if (!api || !ta || ta.disabled) {
        if (tries++ < 20) timer = window.setTimeout(tryFocus, 40);
        return;
      }
      api.focus({ preventScroll: true });
    };
    timer = window.setTimeout(tryFocus, 0);
    return () => clearTimeout(timer);
  }, [autoFocus, focusSignal]);

  useEffect(() => {
    if (!enableTypeToFocus) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;

      const api = textareaRef.current;
      const ta = getNativeTextArea(api);
      if (!api || !ta || ta.disabled || document.activeElement === ta) return;
      if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return;

      e.preventDefault();
      api.focus();
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const next = ta.value.slice(0, start) + e.key + ta.value.slice(end);
      setText(next);
      requestAnimationFrame(() => {
        const nextTa = getNativeTextArea(textareaRef.current);
        if (!nextTa) return;
        nextTa.selectionStart = nextTa.selectionEnd = start + e.key.length;
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enableTypeToFocus]);

  const handleSend = () => {
    if (!sendEnabled) return;
    onSend(text.trim());
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn("shrink-0 mx-2 mb-2 rounded-xl border overflow-hidden flex flex-col", noModel ? "bg-muted/50 border-border" : "bg-[#3c3c3c]/90 border-border", className)}>
      <Input.TextArea
        ref={textareaRef}
        data-chat-input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={generating || noModel}
        placeholder={noModel ? "Select a model to start chatting" : placeholder}
        autoSize={{ minRows: 1, maxRows: 10 }}
        variant="borderless"
        style={chatComposerTextStyle}
        className={cn(
          "bg-transparent focus:bg-transparent shadow-none px-3.5 pt-1.5 pb-2 font-medium font-family-chat antialiased transition-none text-(length:--chat-composer-size) leading-(--chat-composer-leading)",
          "outline-none focus:outline-none focus-visible:outline-none! focus-visible:outline-offset-0!",
          noModel ? "text-muted-foreground cursor-not-allowed placeholder:text-border-hover" : "text-[#ececec] placeholder:text-muted-foreground placeholder:font-medium",
        )}
      />

      <div className="flex items-center gap-1.5 pb-2 px-2">
        <RenderIf condition={!hideConfig}>
          <SelectModel providerId={providerId} model={model} onChange={onModelChange} />
          <RenderIf condition={tools !== undefined}>
            <SelectTools tools={tools ?? []} loading={toolsLoading} />
          </RenderIf>
        </RenderIf>

        <div className="flex-1" />

        <RenderIf
          condition={generating}
          fallback={
            <button
              type="button"
              disabled={!sendEnabled}
              onClick={handleSend}
              title="Send (Enter)"
              className={["w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-100", sendEnabled ? "bg-primary border border-primary-600 cursor-pointer hover:bg-primary/90 active:scale-95" : "bg-border cursor-not-allowed opacity-50"].join(" ")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <title>Send</title>
                <path d="M6 9.5V2.5M6 2.5L3 5.5M6 2.5L9 5.5" stroke={sendEnabled ? "#1a1a1a" : "currentColor"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          }
        >
          <button type="button" onClick={onCancel} title="Stop" className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 cursor-pointer hover:bg-primary/90 active:scale-95 transition-all duration-100">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <title>Stop</title>
              <rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="currentColor" />
            </svg>
          </button>
        </RenderIf>
      </div>
    </div>
  );
}
