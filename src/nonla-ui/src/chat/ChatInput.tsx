import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
};

function resize(el: HTMLTextAreaElement | null, maxRows = 6) {
  if (!el) return;
  el.style.height = "auto";
  const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 22;
  const max = line * maxRows + 8;
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
}

export function ChatInput({
  generating = false,
  placeholder = "Message…",
  disabled = false,
  onSend,
  onCancel,
  toolbar,
  defaultValue = "",
  className,
  autoFocus = false,
}: ChatInputProps) {
  const [text, setText] = useState(defaultValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasText = text.trim().length > 0;
  const canSend = !generating && !disabled && hasText;

  useLayoutEffect(() => {
    resize(textareaRef.current);
  }, [text]);

  useEffect(() => {
    if (!autoFocus) return;
    textareaRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={cn(
        "nonla-chat-input shrink-0 mx-2 mb-3 pt-1 rounded-xl border overflow-hidden flex flex-col",
        disabled ? "bg-muted/50 border-border" : "bg-[#3c3c3c]/90 border-border",
        className,
      )}
    >
      <textarea
        ref={textareaRef}
        data-chat-input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={generating || disabled}
        placeholder={disabled ? "Unavailable" : placeholder}
        rows={1}
        className={cn(
          "w-full resize-none border-0 bg-transparent shadow-none outline-none focus:outline-none px-3.5 pt-3.5 pb-2",
          "text-(length:--chat-composer-size) leading-(--chat-composer-leading) font-medium antialiased",
          disabled
            ? "text-muted-foreground cursor-not-allowed placeholder:text-border"
            : "text-[#ececec] placeholder:text-quaternary-foreground",
        )}
      />

      <div className="flex items-center gap-1.5 pb-2 px-2">
        {toolbar}
        <div className="flex-1" />

        {generating ? (
          <button
            type="button"
            onClick={onCancel}
            title="Stop"
            className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 cursor-pointer hover:bg-primary/90 active:scale-95 transition-all duration-100 border-0"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="currentColor" />
            </svg>
            <span className="sr-only">Stop</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={!canSend}
            onClick={handleSend}
            title="Send (Enter)"
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-100 border-0",
              canSend
                ? "bg-primary border border-primary cursor-pointer hover:bg-primary/90 active:scale-95"
                : "bg-border cursor-not-allowed opacity-50",
            )}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M6 9.5V2.5M6 2.5L3 5.5M6 2.5L9 5.5"
                stroke={canSend ? "var(--primary-foreground)" : "currentColor"}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="sr-only">Send</span>
          </button>
        )}
      </div>
    </div>
  );
}
