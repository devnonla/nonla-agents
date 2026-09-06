import { type ReactNode, useCallback, useRef, useState } from "react";

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, "").trim();
}

function tableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  const data = rows.map((tr) => Array.from(tr.querySelectorAll("th, td")).map((cell) => escapeCell(cell.textContent ?? "")));
  if (data.length === 0) return "";

  const colCount = Math.max(...data.map((row) => row.length));
  const pad = (row: string[]) => Array.from({ length: colCount }, (_, i) => row[i] ?? "");

  const header = pad(data[0]!);
  const separator = header.map(() => "---");
  const body = data.slice(1).map(pad);

  return [`| ${header.join(" | ")} |`, `| ${separator.join(" | ")} |`, ...body.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

export function ChatMarkdownTable({ children }: { children: ReactNode }) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    const markdown = tableToMarkdown(table);
    void navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  return (
    <div className="relative my-4 max-w-full overflow-hidden rounded-lg border border-border-subtle group">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-1 right-1 z-10 w-6 h-6 flex items-center justify-center rounded-md bg-card/80 border border-border-subtle text-muted-foreground hover:text-foreground hover:bg-muted transition-opacity cursor-pointer opacity-0 group-hover:opacity-100"
        title={copied ? "Copied" : "Copy as Markdown"}
      >
        {copied ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
            <path d="M5 15V7a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        )}
      </button>

      <div className="overflow-x-auto">
        <table
          ref={tableRef}
          className="w-max min-w-full wrap-normal border-separate border-spacing-0 text-[14px] [&_th]:bg-foreground/[0.07] [&_th]:text-foreground [&_th]:font-semibold [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:align-top [&_th]:border-r [&_th]:border-b [&_th]:border-border-subtle [&_th:last-child]:border-r-0 [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top [&_td]:text-foreground [&_td]:border-r [&_td]:border-b [&_td]:border-border-subtle [&_td:last-child]:border-r-0 [&_tbody_tr:last-child_td]:border-b-0"
        >
          {children}
        </table>
      </div>
    </div>
  );
}
