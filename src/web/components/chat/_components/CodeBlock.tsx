import { ClipboardIcon } from "@solar-icons/react/dynamic/clipboard";
import { ClipboardCheckIcon } from "@solar-icons/react/dynamic/clipboard-check";
import { useState } from "react";
import { MermaidBlock } from "./MermaidBlock";

// ── Language display labels ───────────────────────────────────────────────
const LANG_LABELS: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  py: "Python",
  python: "Python",
  sh: "Shell",
  bash: "Bash",
  zsh: "Zsh",
  shell: "Shell",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  md: "Markdown",
  markdown: "Markdown",
  rs: "Rust",
  rust: "Rust",
  go: "Go",
  java: "Java",
  cpp: "C++",
  c: "C",
  cs: "C#",
  csharp: "C#",
  php: "PHP",
  rb: "Ruby",
  ruby: "Ruby",
  swift: "Swift",
  kt: "Kotlin",
  kotlin: "Kotlin",
  graphql: "GraphQL",
  dockerfile: "Dockerfile",
  xml: "XML",
};

// ── Props ─────────────────────────────────────────────────────────────────
interface CodeBlockProps {
  language?: string;
  children: string;
  /** When true, show Mermaid source instead of rendering (incomplete stream). */
  pendingMermaid?: boolean;
}

export function CodeBlock({ language = "", children, pendingMermaid = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const lang = language.toLowerCase().trim();
  const isMermaid = lang === "mermaid";
  const label = isMermaid ? "Mermaid" : (LANG_LABELS[lang] ?? (lang || "Code"));

  const handleCopy = () => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isMermaid && pendingMermaid) {
    return (
      <div className="my-3.5 last:mb-0 rounded-md overflow-hidden bg-black/20 border border-white/5">
        <div className="flex items-center gap-1.5 px-3 py-2 select-none border-b border-white/5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" />
          <span className="font-mono text-[11px] text-white/30">Mermaid</span>
        </div>
        <pre className="m-0 p-4 text-(length:--chat-code-size) leading-5.5 text-white/60 whitespace-pre-wrap font-mono">{children}</pre>
      </div>
    );
  }

  if (isMermaid) {
    return <MermaidBlock>{children}</MermaidBlock>;
  }

  return (
    <div className="relative rounded-lg overflow-hidden bg-black/20 border border-white/5">
      {/* Label + Copy — floating inside code block */}
      <div className="flex items-center justify-between px-2 pl-3 py-1 select-none border-b border-white/5">
        <span className="font-mono text-[11px] text-white/30">{label}</span>
        <button type="button" onClick={handleCopy} className="flex items-center justify-center w-5 h-5 rounded bg-transparent text-white/25 cursor-pointer transition-colors hover:text-white/60" title="Copy code">
          {copied ? <ClipboardCheckIcon size={13} /> : <ClipboardIcon size={13} />}
        </button>
      </div>

      <pre className="m-0 overflow-x-auto p-4 text-(length:--chat-code-size) leading-5.5 whitespace-pre font-mono text-white/80">
        <code>{children}</code>
      </pre>
    </div>
  );
}
