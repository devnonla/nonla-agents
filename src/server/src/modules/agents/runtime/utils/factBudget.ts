/**
 * Memory node budget — select which nodes stay always-on in the system prompt.
 * Newest first until char/item budget is reached.
 */

export const FACT_BUDGET_CHARS = 4000;
export const FACT_BUDGET_MAX_ITEMS = 40;
export const MEMORY_CONTENT_MAX = 600;

export type NodeForBudget = {
  id: string;
  content: string;
  updatedAt?: Date | number | null;
  createdAt?: Date | number | null;
};

export type FactBudgetResult = {
  injected: NodeForBudget[];
  overflow: NodeForBudget[];
  injectedChars: number;
};

function sortKey(n: NodeForBudget): number {
  const t = n.updatedAt ?? n.createdAt;
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t < 1e12 ? t * 1000 : t;
  return 0;
}

export function nodePromptLine(n: { content?: string | null }): string {
  return (n.content ?? "").trim();
}

/** Short preview for UI (first line, truncated). */
export function nodeTitle(content: string, max = 48): string {
  const line = content.trim().split(/\n/)[0] ?? "";
  if (!line) return "Memory node";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function selectNodesForPrompt(nodes: NodeForBudget[], opts: { maxChars?: number; maxItems?: number } = {}): FactBudgetResult {
  const maxChars = opts.maxChars ?? FACT_BUDGET_CHARS;
  const maxItems = opts.maxItems ?? FACT_BUDGET_MAX_ITEMS;

  const ordered = [...nodes].sort((a, b) => sortKey(b) - sortKey(a));

  const injected: NodeForBudget[] = [];
  const overflow: NodeForBudget[] = [];
  let chars = 0;

  for (const node of ordered) {
    const line = nodePromptLine(node);
    if (!line) continue;
    const next = chars + line.length + 1;
    if (injected.length >= maxItems || (injected.length > 0 && next > maxChars)) {
      overflow.push(node);
      continue;
    }
    injected.push(node);
    chars = next;
  }

  return { injected, overflow, injectedChars: chars };
}

/** @deprecated use selectNodesForPrompt */
export const selectFactsForPrompt = selectNodesForPrompt;
