import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";

export type ChatInputProps = {
  generating?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onSend: (text: string) => void;
  onCancel?: () => void;
  /** Left-side toolbar (model picker, tools, …). */
  toolbar?: ReactNode;
  defaultValue?: string;
  className?: string;
  autoFocus?: boolean;
  /** When this changes (e.g. conversation id), clear + focus the input. */
  focusSignal?: string | null;
  /** Redirect bare keypresses into this input when focus is elsewhere. */
  enableTypeToFocus?: boolean;
};

function resize(el: HTMLTextAreaElement | null, maxRows = 10) {
  if (!el) return;
  el.style.height = "auto";
  const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 22;
  const max = line * maxRows + 8;
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return true;
  return Boolean(el.closest("input, textarea, select, [contenteditable], [role='dialog'], [role='alertdialog'], [role='listbox'], [role='menu'], .monaco-editor"));
}

export function ChatInput({ generating = false, placeholder = "Message…", disabled = false, onSend, onCancel, toolbar, defaultValue = "", className, autoFocus = false, focusSignal, enableTypeToFocus = false }: ChatInputProps) {
  const [text, setText] = useState(defaultValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasText = text.trim().length > 0;
  const canSend = !generating && !disabled && hasText;

  useLayoutEffect(() => {
    resize(textareaRef.current);
  }, [text]);

  useEffect(() => {
    const onSignal = focusSignal !== undefined;
    if (!autoFocus && !onSignal) return;
    if (onSignal) setText("");

    let tries = 0;
    let timer = 0;
    const tryFocus = () => {
      const ta = textareaRef.current;
      if (!ta || ta.disabled) {
        if (tries++ < 20) timer = window.setTimeout(tryFocus, 40);
        return;
      }
      ta.focus({ preventScroll: true });
    };
    timer = window.setTimeout(tryFocus, 0);
    return () => clearTimeout(timer);
  }, [autoFocus, focusSignal]);

  useEffect(() => {
    if (!enableTypeToFocus) return;

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;

      const ta = textareaRef.current;
      if (!ta || ta.disabled || document.activeElement === ta) return;
      if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return;

      e.preventDefault();
      ta.focus();
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const next = ta.value.slice(0, start) + e.key + ta.value.slice(end);
      setText(next);
      requestAnimationFrame(() => {
        const nextTa = textareaRef.current;
        if (!nextTa) return;
        nextTa.selectionStart = nextTa.selectionEnd = start + e.key.length;
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enableTypeToFocus]);

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn("nonla-chat-input shrink-0 mx-2 mb-2 pt-1 rounded-xl border overflow-hidden flex flex-col", disabled ? "bg-muted/50 border-border" : "bg-neutral-50/10 border-border", className)}>
      <textarea
        ref={textareaRef}
        data-chat-input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={generating || disabled}
        placeholder={placeholder}
        rows={1}
        className={cn(
          "w-full resize-none border-0 bg-transparent shadow-none outline-none focus:outline-none px-3.5 pt-1.5 pb-2",
          "text-(length:--chat-composer-size) leading-(--chat-composer-leading) font-medium antialiased",
          disabled ? "text-muted-foreground cursor-not-allowed placeholder:text-border-hover" : "text-foreground placeholder:text-muted-foreground placeholder:font-medium",
        )}
      />

      <div className="flex items-center gap-1.5 pb-2 px-2">
        {toolbar}
        <div className="flex-1" />

        {generating ? (
          <button type="button" onClick={onCancel} title="Stop" className="w-6 h-6 rounded-full bg-brand text-[var(--nonla-solid-fg)] flex items-center justify-center shrink-0 cursor-pointer hover:bg-brand/90 active:scale-95 transition-all duration-100 border-0">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="currentColor" />
            </svg>
            <span className="sr-only">Stop</span>
          </button>
        ) : (
          <button type="button" disabled={!canSend} onClick={handleSend} title="Send (Enter)" className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-100 border-0", canSend ? "bg-neutral-50 text-background cursor-pointer" : "bg-border text-muted-foreground cursor-not-allowed opacity-50")}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 9.5V2.5M6 2.5L3 5.5M6 2.5L9 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">Send</span>
          </button>
        )}
      </div>
    </div>
  );
}
