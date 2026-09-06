import { type ComponentProps, type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { cn } from "../lib/cn";
import { highlightCode, languageLabel, wrapHljsLines } from "./highlight";

type CodeBlockContextValue = {
  code: string;
};

const CodeBlockContext = createContext<CodeBlockContextValue | null>(null);

export type CodeBlockProps = ComponentProps<"div"> & {
  /** Source code to render. */
  code: string;
  /** Language for highlight.js (`javascript`, `tsx`, `json`, …). */
  language?: string;
  /** Filename / label shown in the header. Falls back to the language name. */
  title?: ReactNode;
  /** Show gutter line numbers. */
  lineNumbers?: boolean;
  /** Wrap long lines instead of horizontal scroll. */
  wordWrap?: boolean;
};

function CodeFileIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth="25" strokeLinecap="round" d="M208 128l-80 80M192 40 40 192" />
    </svg>
  );
}

function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8" y="8" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M4 16V4c0-1.1.9-2 2-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type CodeBlockCopyButtonProps = ComponentProps<"button"> & {
  content?: string;
};

export function CodeBlockCopyButton({ content, className, ...props }: CodeBlockCopyButtonProps) {
  const ctx = useContext(CodeBlockContext);
  const text = content ?? ctx?.code ?? "";
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      title={copied ? "Copied" : "Copy to clipboard"}
      aria-label={copied ? "Copied" : "Copy code"}
      className={cn("inline-flex size-7 cursor-pointer shrink-0 items-center justify-center text-muted-foreground transition-colors duration-200", "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          /* ignore */
        }
      }}
      {...props}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

export function CodeBlock({ code, language, title, lineNumbers = false, wordWrap = false, className, children, ...props }: CodeBlockProps) {
  const html = useMemo(() => {
    const highlighted = highlightCode(code, language);
    return lineNumbers ? wrapHljsLines(highlighted) : highlighted;
  }, [code, language, lineNumbers]);

  const label = title ?? languageLabel(language);

  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div className={cn("nonla-codeblock relative flex min-w-0 w-full flex-col overflow-clip rounded-lg border border-border bg-muted/80 text-sm text-foreground", className)} data-language={language} {...props}>
        <div className="flex h-9 items-center justify-between gap-2 pl-2 pr-1 text-sm text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2">
            {label ? (
              <>
                <CodeFileIcon />
                <span className="truncate font-medium">{label}</span>
              </>
            ) : null}
          </div>
          <CodeBlockCopyButton />
        </div>

        <div className={cn("nonla-codeblock-body nonla-codeblock-well relative min-w-0 overflow-y-auto bg-background font-mono text-[13px] leading-5", children ? "max-h-96" : "mx-0.5 mb-0.5 max-h-96 rounded-lg")}>
          <div className={cn("w-full", !wordWrap && "overflow-x-auto")}>
            <pre className={cn("nonla-codeblock-pre m-0 whitespace-pre break-normal", lineNumbers && "nonla-codeblock-lines", wordWrap && "whitespace-pre-wrap wrap-break-word")}>
              <code className={cn("block px-3 py-2.5", !wordWrap && "w-max min-w-full")} dangerouslySetInnerHTML={{ __html: html }} />
            </pre>
          </div>
        </div>
        {children}
      </div>
    </CodeBlockContext.Provider>
  );
}
