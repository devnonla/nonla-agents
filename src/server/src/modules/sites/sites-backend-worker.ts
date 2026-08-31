/**
 * Site backend worker — runs in a Bun subprocess. No SQLite / no Hono.
 * Speaks to parent via NONLAAGENTS_URL + NONLAAGENTS_TOKEN.
 * Writes one JSON line to stdout: { ok: true, value } | { ok: false, error }.
 */

import { createSiteNonlaagentsHttpClient } from "./sites-nonlaagents-http.js";

interface SerializedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

type HandleFn = (args: {
  request: Request;
  params: Record<string, string>;
  nonlaagents: unknown;
  query: Record<string, string>;
}) => unknown;

function emit(payload: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function loadJsonFile<T>(path: string | undefined, fallback: T): Promise<T> {
  if (!path || !(await Bun.file(path).exists())) return fallback;
  return JSON.parse(await Bun.file(path).text()) as T;
}

function buildRequest(serialized: SerializedRequest, query: Record<string, string>): Request {
  const url = new URL(serialized.url);
  for (const [k, v] of Object.entries(query)) {
    if (!url.searchParams.has(k)) url.searchParams.set(k, v);
  }
  return new Request(url.toString(), {
    method: serialized.method,
    headers: serialized.headers,
    body: serialized.method === "GET" || serialized.method === "HEAD" ? undefined : serialized.body || undefined,
  });
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Response) {
    return {
      ok: value.ok,
      status: value.status,
      redirect: value.status >= 300 && value.status < 400,
      location: value.headers.get("Location"),
    };
  }
  return value;
}

async function main() {
  const runtimeDir = process.env.SITE_RUNTIME_DIR;
  const requestPath = process.env.SITE_REQUEST_PATH;
  if (!runtimeDir) throw new Error("SITE_RUNTIME_DIR is required");
  if (!requestPath) throw new Error("SITE_REQUEST_PATH is required");

  const serialized = await loadJsonFile<SerializedRequest | null>(requestPath, null);
  if (!serialized) throw new Error("SITE_REQUEST_PATH is empty");

  const queryFile = await loadJsonFile<Record<string, string>>(process.env.SITE_QUERY_PATH, {});
  const params = await loadJsonFile<Record<string, string>>(process.env.SITE_PARAMS_PATH, {});
  const request = buildRequest(serialized, queryFile);
  const query = Object.keys(queryFile).length > 0 ? queryFile : Object.fromEntries(new URL(request.url).searchParams.entries());
  const nonlaagents = createSiteNonlaagentsHttpClient();

  const backendPath = `${runtimeDir}/backend.ts`;
  if (!(await Bun.file(backendPath).exists())) throw new Error("Missing backend.ts");

  const mod = (await import(Bun.pathToFileURL(backendPath).href)) as { handle?: HandleFn };
  if (typeof mod.handle !== "function") {
    throw new Error("backend.ts must export async function handle");
  }

  const value = await mod.handle({ request, params, nonlaagents, query });
  emit({ ok: true, value: serializeValue(value) });
  process.exit(0);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  try {
    emit({ ok: false, error: message });
  } catch {
    process.stderr.write(`${message}\n`);
  }
  process.exit(1);
});
