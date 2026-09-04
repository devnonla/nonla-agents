import { highlight, type LanguageName } from "sugar-high";
import {
  type ComponentProps,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cn } from "../lib/cn";

const LANG_ALIAS: Record<string, LanguageName> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  yml: "yaml",
  md: "markdown",
  rs: "rust",
  cs: "csharp",
  "c++": "cpp",
  hpp: "cpp",
  h: "c",
  ps1: "powershell",
  docker: "dockerfile",
  gql: "graphql",
};

function normalizeLang(language?: string): LanguageName | undefined {
  if (!language) return undefined;
  const key = language.trim().toLowerCase();
  if (key in LANG_ALIAS) return LANG_ALIAS[key];
  return key as LanguageName;
}

type CodeBlockContextValue = {
  code: string;
};

const CodeBlockContext = createContext<CodeBlockContextValue | null>(null);

function useCodeBlock() {
  const ctx = useContext(CodeBlockContext);
  if (!ctx) throw new Error("CodeBlock compound parts must be used within <CodeBlock>");
  return ctx;
}

export type CodeBlockProps = ComponentProps<"div"> & {
  /** Source code to render. */
  code: string;
  /** Language for sugar-high (`tsx`, `ts`, `json`, …). */
  language?: string;
  /** Filename / label shown in the header. */
  title?: ReactNode;
  /** Show gutter line numbers. */
  lineNumbers?: boolean;
  /** Wrap long lines instead of horizontal scroll. */
  wordWrap?: boolean;
  /** Hide the copy button. */
  showCopy?: boolean;
  /** Hide language badge in the header. */
  showLanguage?: boolean;
  /** Custom header — when set, replaces the default title/lang row (copy still available unless showCopy=false). */
  header?: ReactNode;
};

function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 15V7a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
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
      aria-label={copied ? "Copied" : "Copy code"}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-white/8 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className,
      )}
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

export function CodeBlock({
  code,
  language = "tsx",
  title,
  lineNumbers = false,
  wordWrap = false,
  showCopy = true,
  showLanguage = true,
  header,
  className,
  children,
  ...props
}: CodeBlockProps) {
  const lang = normalizeLang(language);
  const html = useMemo(() => {
    try {
      return highlight(code, lang ? { lang } : undefined);
    } catch {
      return highlight(code);
    }
  }, [code, lang]);

  const showHeader = Boolean(header ?? title ?? (showLanguage && language) ?? showCopy);

  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        className={cn(
          "nonla-codeblock group/codeblock relative w-full overflow-hidden rounded-lg border border-[var(--popper-border)] bg-[var(--nonla-elevated,#1e1e1e)] text-sm text-foreground shadow-[var(--popper-shadow)]",
          className,
        )}
        data-language={language}
        {...props}
      >
        {showHeader ? (
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            {header ?? (
              <>
                <div className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{title}</div>
                {showLanguage && language ? (
                  <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-tertiary-foreground">
                    {language}
                  </span>
                ) : null}
                {showCopy ? <CodeBlockCopyButton /> : null}
              </>
            )}
          </div>
        ) : null}

        <div className={cn("nonla-codeblock-body relative", !showHeader && showCopy && "pt-0")}>
          {!showHeader && showCopy ? (
            <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover/codeblock:opacity-100 focus-within:opacity-100">
              <CodeBlockCopyButton className="bg-[var(--nonla-elevated)]/80 backdrop-blur-sm" />
            </div>
          ) : null}
          <pre
            className={cn(
              "nonla-codeblock-pre m-0 overflow-x-auto font-mono text-[13px] leading-[1.65]",
              lineNumbers && "nonla-codeblock-lines",
              wordWrap && "whitespace-pre-wrap break-words",
            )}
          >
            <code className="block px-4 py-3" dangerouslySetInnerHTML={{ __html: html }} />
          </pre>
        </div>
        {children}
      </div>
    </CodeBlockContext.Provider>
  );
}

export function CodeBlockHeader({ className, children, ...props }: ComponentProps<"div">) {
  useCodeBlock();
  return (
    <div className={cn("flex items-center gap-2 border-b border-border px-3 py-2", className)} {...props}>
      {children}
    </div>
  );
}

export function CodeBlockContent({ className, children, ...props }: ComponentProps<"div">) {
  useCodeBlock();
  return (
    <div className={cn("nonla-codeblock-body", className)} {...props}>
      {children}
    </div>
  );
}
