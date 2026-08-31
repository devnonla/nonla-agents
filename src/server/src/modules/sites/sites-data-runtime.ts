import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { runSiteBackendWorker } from "./sites-backend-runner.js";
import { type SiteTree, getTreeDir, readSourceFile, treeContentHash } from "./sites-fs.js";

const importGeneration = new Map<string, number>();
const DATA_REV = "backend-v2";

function treeKey(siteId: string, tree: SiteTree) {
  return `${siteId}:${tree}`;
}

export function invalidateSiteDataModules(siteId: string) {
  for (const tree of ["prod", "draft"] as SiteTree[]) {
    const tk = treeKey(siteId, tree);
    importGeneration.set(tk, (importGeneration.get(tk) ?? 0) + 1);
  }
}

async function materializeDataDir(siteId: string, tree: SiteTree): Promise<string> {
  const dir = getTreeDir(siteId, tree);
  const key = treeKey(siteId, tree);
  let gen = importGeneration.get(key) ?? 0;
  const root = `${dir}/.data-runtime`;
  const stamp = `${treeContentHash(siteId, tree)}:${DATA_REV}`;
  const dirFor = (g: number) => `${root}/${g}`;
  const stampPath = (g: number) => `${dirFor(g)}/.stamp`;
  const backendPath = (g: number) => `${dirFor(g)}/backend.ts`;

  const stampFile = Bun.file(stampPath(gen));
  const backendFile = Bun.file(backendPath(gen));
  if ((await stampFile.exists()) && (await stampFile.text()) === stamp && (await backendFile.exists())) {
    return dirFor(gen);
  }

  if (await backendFile.exists()) {
    gen += 1;
    importGeneration.set(key, gen);
  }

  const out = dirFor(gen);
  await Bun.write(`${out}/backend.ts`, readSourceFile(siteId, tree, "backend.ts") || "export async function handle(){return{}}");
  await Bun.write(stampPath(gen), stamp);
  return out;
}

export async function runSiteHandle(siteId: string, tree: SiteTree, opts: { request: Request; query?: Record<string, string>; params?: Record<string, string> }): Promise<{ value: unknown }> {
  const runtimeDir = await materializeDataDir(siteId, tree);
  try {
    const result = await runSiteBackendWorker({
      runtimeDir,
      treeDir: getTreeDir(siteId, tree),
      request: opts.request,
      query: opts.query,
      params: opts.params,
    });
    if (opts.request.method !== "GET" && opts.request.method !== "HEAD") {
      invalidateSiteDataModules(siteId);
    }
    return result;
  } catch (err: unknown) {
    const label = opts.request.method === "GET" || opts.request.method === "HEAD" ? "handle(GET)" : "handle(POST)";
    const message = err instanceof Error ? err.message : String(err);
    throw new BadRequestException(`${label} failed: ${message}`);
  }
}

/** GET …/data → backend handle */
export async function runSiteLoad(siteId: string, tree: SiteTree, opts: { request: Request; query?: Record<string, string>; params?: Record<string, string> }): Promise<{ data: unknown }> {
  const getRequest = new Request(opts.request.url, {
    method: "GET",
    headers: opts.request.headers,
  });
  const { value } = await runSiteHandle(siteId, tree, { ...opts, request: getRequest });
  return { data: value };
}

/** POST …/action → backend handle */
export async function runSiteActionModule(siteId: string, tree: SiteTree, opts: { request: Request; params?: Record<string, string> }): Promise<{ result: unknown }> {
  const { value } = await runSiteHandle(siteId, tree, opts);
  return { result: value };
}
