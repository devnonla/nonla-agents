// ─── Param type ───────────────────────────────────────────────────────────────

export interface Param {
  id: string;
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
}

// ─── Default code template ────────────────────────────────────────────────────

export const DEFAULT_CODE = `// @name Search Products
// @description Search for products from the API based on query, tags and filters
// @param {string} query (required) - Search query text
// @param {number} limit (optional) - Max results to return
// @param {string[]} tags (optional) - List of tags to filter
// @param {object} filters (optional) - Additional filter options
// @param {string} filters.category (optional) - Category name
// @param {object[]} items (optional) - Array of item objects
// @param {string} items[].name (optional) - Item name
// @param {number} items[].price (optional) - Item price

export default async function main(input: Record<string, unknown>) {
  const query = String(input.query ?? "");
  const limit = Number(input.limit ?? 5);
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetch(\`https://api.example.com/search?\${params}\`);
  const data = (await res.json()) as { items?: unknown[] };
  return { results: (data.items ?? []).slice(0, limit) };
}
`;
