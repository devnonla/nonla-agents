const ICONIFY_BASE = "https://api.iconify.design";
const PREFIX = "lucide";
const COLLECTION_URL = `${ICONIFY_BASE}/collection?prefix=${PREFIX}`;
const CACHE_KEY = "iconify:lucide:names";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STROKE_WIDTH = "1.5";

type NamesCachePayload = { fetchedAt: number; names: string[] };

let memoryNames: string[] | null = null;
const svgCache = new Map<string, string>();
const svgInflight = new Map<string, Promise<string>>();

function isNoisyName(name: string): boolean {
  return name.endsWith("-off");
}

/** Normalize Lucide stroke to a thinner default for UI density. */
export function withThinStroke(svg: string): string {
  return svg.replace(/stroke-width="[^"]*"/g, `stroke-width="${STROKE_WIDTH}"`).replace(/stroke-width:\s*[^;"']+/g, `stroke-width:${STROKE_WIDTH}`);
}

function readLocalNames(): string[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NamesCachePayload;
    if (!parsed?.names?.length || typeof parsed.fetchedAt !== "number") return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.names;
  } catch {
    return null;
  }
}

function writeLocalNames(names: string[]) {
  try {
    const payload: NamesCachePayload = { fetchedAt: Date.now(), names };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function isSvgIcon(value?: string | null): boolean {
  return !!value && value.trimStart().startsWith("<svg");
}

export async function getLucideIconNames(): Promise<string[]> {
  if (memoryNames) return memoryNames;

  const cached = readLocalNames();
  if (cached) {
    memoryNames = cached;
    return cached;
  }

  const res = await fetch(COLLECTION_URL);
  if (!res.ok) throw new Error(`Failed to load Lucide icons (${res.status})`);
  const data = (await res.json()) as { uncategorized?: string[] };
  const names = (data.uncategorized ?? []).filter((n) => !isNoisyName(n));
  memoryNames = names;
  writeLocalNames(names);
  return names;
}

export async function fetchLucideSvg(name: string): Promise<string> {
  const cached = svgCache.get(name);
  if (cached) return cached;

  const pending = svgInflight.get(name);
  if (pending) return pending;

  const promise = fetch(`${ICONIFY_BASE}/${PREFIX}/${encodeURIComponent(name)}.svg`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load icon "${name}" (${res.status})`);
      const svg = withThinStroke((await res.text()).trim());
      if (!svg.startsWith("<svg")) throw new Error(`Invalid SVG for "${name}"`);
      svgCache.set(name, svg);
      return svg;
    })
    .finally(() => {
      svgInflight.delete(name);
    });

  svgInflight.set(name, promise);
  return promise;
}

/** Batch-fetch SVG bodies for picker previews. Returns Map<name, svg>. */
export async function fetchLucideSvgs(names: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const missing: string[] = [];

  for (const name of names) {
    const cached = svgCache.get(name);
    if (cached) result.set(name, cached);
    else missing.push(name);
  }

  if (missing.length === 0) return result;

  const chunkSize = 40;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    const url = `${ICONIFY_BASE}/${PREFIX}.json?icons=${chunk.map(encodeURIComponent).join(",")}`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = (await res.json()) as {
      icons?: Record<string, { body: string }>;
      width?: number;
      height?: number;
    };
    const w = data.width ?? 24;
    const h = data.height ?? 24;
    for (const [name, icon] of Object.entries(data.icons ?? {})) {
      const svg = withThinStroke(`<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 ${w} ${h}">${icon.body}</svg>`);
      svgCache.set(name, svg);
      result.set(name, svg);
    }
  }

  return result;
}
