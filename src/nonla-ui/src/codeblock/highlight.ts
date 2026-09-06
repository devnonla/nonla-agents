import hljs from "highlight.js/lib/common";
import bash from "highlight.js/lib/languages/bash";

/** highlight.js bash only colors shell builtins (`echo`, `ls`) — not `docker run`, flags, or numbers. */
const CLI_COMMANDS = [
  "docker",
  "git",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "curl",
  "wget",
  "ssh",
  "scp",
  "rsync",
  "brew",
  "pip",
  "pip3",
  "cargo",
  "make",
  "node",
  "deno",
  "python",
  "python3",
  "kubectl",
  "helm",
  "aws",
  "gh",
];

const SHELL_KEYWORDS = "if|then|else|elif|fi|for|while|until|in|do|done|case|esac|function|select|time|coproc";

hljs.registerLanguage("bash", (api) => {
  const lang = bash(api);
  const keywords = lang.keywords;
  if (keywords && typeof keywords === "object" && !Array.isArray(keywords) && Array.isArray(keywords.built_in)) {
    keywords.built_in = [...keywords.built_in, ...CLI_COMMANDS];
  }
  lang.contains = [
    ...(lang.contains ?? []),
    {
      match: [/(?:^|\n)\s*/, new RegExp(`(?!(?:${SHELL_KEYWORDS})\\b)[a-z][\\w.-]*`)],
      scope: { 2: "built_in" },
      relevance: 0,
    },
    { className: "number", match: /\b\d+\b/, relevance: 0 },
    { className: "attr", match: /(?<=[\s=])-{1,2}[A-Za-z0-9][\w-]*/, relevance: 0 },
  ];
  return lang;
});

const LANG_ALIAS: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  shell: "bash",
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

export function normalizeLang(language?: string): string | undefined {
  if (!language) return undefined;
  const key = language.trim().toLowerCase();
  if (!key) return undefined;
  return LANG_ALIAS[key] ?? key;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightCode(code: string, language?: string): string {
  const lang = normalizeLang(language);
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {
      /* fall through */
    }
  }
  try {
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}

export function wrapHljsLines(html: string): string {
  return html.split("\n").map((line) => `<span class="hljs-line">${line}</span>`).join("\n");
}

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
  mermaid: "Mermaid",
};

/** Display name for a fenced-code language (`js` → `JavaScript`). */
export function languageLabel(language?: string): string | undefined {
  if (!language) return undefined;
  const key = language.trim().toLowerCase();
  if (!key) return undefined;
  return LANG_LABELS[key] ?? language.trim();
}
