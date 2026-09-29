/**
 * search_npm — look up packages on the public npm registry.
 * Used by coding assistants so they prefer existing libraries over writing from scratch.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { packageNameFromSpecifier } from "../../sandbox/detect-packages.js";

const REGISTRY = "https://registry.npmjs.org";
const DEFAULT_SIZE = 8;
const HARD_MAX_SIZE = 15;
const README_MAX_CHARS = 2_000;
const TIMEOUT_MS = 12_000;

export type SearchNpmInput = {
  query?: string;
  name?: string;
  size?: number;
};

export type SearchNpmResult = Record<string, unknown>;

type NpmFetcher = (url: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: NpmFetcher = (url, init) => fetch(url, init);

let npmFetch: NpmFetcher = defaultFetch;

/** Test-only: swap fetch. Pass null to restore default. */
export function _setNpmFetchForTest(fn: NpmFetcher | null) {
  npmFetch = fn ?? defaultFetch;
}

function clipText(text: string, maxChars: number): { text: string; truncated?: true } {
  if (text.length <= maxChars) return { text };
  return { text: `${text.slice(0, maxChars)}\n\n[truncated]`, truncated: true };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function repoUrl(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  const rec = asRecord(raw);
  return rec ? asString(rec.url) : undefined;
}

async function registryGet(url: string): Promise<{ ok: true; json: unknown } | { ok: false; error: string; status?: number }> {
  try {
    const res = await npmFetch(url, {
      headers: { accept: "application/json", "user-agent": "nonla-agents/search-npm" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const status = res.status;
      if (status === 404) return { ok: false, error: "Package not found", status };
      return { ok: false, error: `npm registry error (${status})`, status };
    }
    return { ok: true, json: await res.json() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

function summarizeSearchHit(raw: unknown): Record<string, unknown> | null {
  const obj = asRecord(raw);
  const pkg = asRecord(obj?.package);
  if (!pkg) return null;
  const name = asString(pkg.name);
  if (!name) return null;
  const score = asRecord(obj?.score);
  const detail = asRecord(score?.detail);
  return {
    name,
    version: asString(pkg.version),
    description: asString(pkg.description) ?? "",
    keywords: Array.isArray(pkg.keywords) ? pkg.keywords.filter((k) => typeof k === "string").slice(0, 8) : [],
    date: asString(pkg.date),
    popularity: asNumber(detail?.popularity),
    quality: asNumber(detail?.quality),
    maintenance: asNumber(detail?.maintenance),
  };
}

async function searchPackages(query: string, size: number): Promise<SearchNpmResult> {
  const url = `${REGISTRY}/-/v1/search?text=${encodeURIComponent(query)}&size=${size}`;
  const got = await registryGet(url);
  if (!got.ok) return { ok: false, error: got.error };

  const json = asRecord(got.json);
  const objects = Array.isArray(json?.objects) ? json.objects : [];
  const packages = objects.map(summarizeSearchHit).filter((p): p is Record<string, unknown> => p != null);

  return {
    ok: true,
    total: asNumber(json?.total) ?? packages.length,
    packages,
  };
}

async function packageInfo(name: string): Promise<SearchNpmResult> {
  const pkgName = packageNameFromSpecifier(name);
  if (!pkgName) return { ok: false, error: `Invalid npm package name: ${name}` };

  const got = await registryGet(`${REGISTRY}/${encodeURIComponent(pkgName)}`);
  if (!got.ok) return { ok: false, error: got.error, name: pkgName };

  const json = asRecord(got.json);
  if (!json) return { ok: false, error: "Invalid registry response", name: pkgName };

  const distTags = asRecord(json["dist-tags"]);
  const latest = asString(distTags?.latest);
  const versions = asRecord(json.versions);
  const latestMeta = latest ? asRecord(versions?.[latest]) : null;
  const readme = asString(json.readme);
  const clipped = readme ? clipText(readme, README_MAX_CHARS) : null;

  return {
    ok: true,
    name: asString(json.name) ?? pkgName,
    version: latest,
    description: asString(json.description) ?? asString(latestMeta?.description) ?? "",
    license: asString(latestMeta?.license) ?? asString(json.license),
    homepage: asString(latestMeta?.homepage),
    repository: repoUrl(latestMeta?.repository) ?? repoUrl(json.repository),
    keywords: Array.isArray(latestMeta?.keywords) ? latestMeta.keywords.filter((k) => typeof k === "string").slice(0, 12) : [],
    ...(clipped ? { readme: clipped.text, ...(clipped.truncated ? { readmeTruncated: true } : {}) } : {}),
  };
}

export async function runSearchNpm(input: SearchNpmInput): Promise<SearchNpmResult> {
  const name = input.name?.trim();
  const query = input.query?.trim();
  if (name) return packageInfo(name);
  if (query) {
    const size = Math.min(HARD_MAX_SIZE, Math.max(1, Math.floor(input.size ?? DEFAULT_SIZE)));
    return searchPackages(query, size);
  }
  return { ok: false, error: "Provide query (search) or name (package details)." };
}

const DESCRIPTION = `Search npm or inspect one package. Prefer an existing library over writing from scratch.

- query: keyword search (name, description, keywords). Returns compact hits ranked by npm.
- name: exact package details (latest version, description, license, homepage, repository, readme excerpt).

Skip native addons (canvas, node-gyp, .node). Prefer maintained, popular, pure JS/TS packages.
Do not use this for trivial logic (string concat, simple math, a few lines of fetch).`;

export const searchNpmTool = tool(async (input) => JSON.stringify(await runSearchNpm(input)), {
  name: "search_npm",
  description: DESCRIPTION,
  schema: z.object({
    query: z.string().optional().describe("Search text, e.g. 'csv parser' or 'cheerio'"),
    name: z.string().optional().describe("Exact npm package name for details (e.g. cheerio, @extractus/article-extractor)"),
    size: z.number().optional().describe("Search result count (default 8, max 15)"),
  }),
});
