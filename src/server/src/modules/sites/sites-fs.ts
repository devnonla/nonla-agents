import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { getDataDir } from "../../common/utils/data-dir.js";

function join(...parts: string[]): string {
  return parts.join("/");
}

export const SITE_SOURCE_FILES = ["app.tsx", "backend.ts", "styles.css", "package.json"] as const;
export type SiteSourceFile = (typeof SITE_SOURCE_FILES)[number];

/** Legacy Remix-shaped files (migrated on demand). */
export const SITE_LEGACY_FILES = ["loader.js", "route.jsx", "action.js"] as const;

/** Pre-unified backend files (migrated to backend.ts). */
export const SITE_SPLIT_BACKEND_FILES = ["data.ts", "actions.ts"] as const;

export type SiteTree = "prod" | "draft";

/** Files copied into the browser bundle workspace (backend.ts runs in a Bun subprocess). */
export const SITE_RUNTIME_FILES = ["app.tsx"] as const;

const DEFAULT_BACKEND = `export async function handle({ request, nonlaagents, query }) {
  if (request.method === "GET" || request.method === "HEAD") {
    return {
      title: "Hello Site",
      message: "Edit app.tsx, backend.ts, and styles.css — then Approve to publish.",
    };
  }

  const contentType = request.headers.get("content-type") || "";
  let body: Record<string, unknown> = {};
  if (contentType.includes("application/json")) {
    body = await request.json().catch(() => ({}));
  } else {
    const fd = await request.formData();
    body = Object.fromEntries(fd.entries());
  }
  if (body._action === "ping") {
    return { ok: true, message: "pong" };
  }
  return { ok: false, message: "No actions defined yet" };
}
`;

const DEFAULT_APP = `import { useEffect, useState } from "react";
import { loadSiteData, siteAction } from "./site-api.js";

export default async function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setError("");
    loadSiteData()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(() => {
    refresh();
  }, []);

  const onDemoAction = async () => {
    setBusy(true);
    try {
      await siteAction({ _action: "ping" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="page">
        <p className="message error">{error}</p>
        <button type="button" onClick={refresh}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page">
        <p className="message">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="title">{data.title}</h1>
      <p className="message">{data.message}</p>
      <button type="button" disabled={busy} onClick={() => void onDemoAction()}>
        {busy ? "Working…" : "Ping action"}
      </button>
    </div>
  );
}
`;

const DEFAULT_STYLES = `.page {
  font-family: system-ui, sans-serif;
  padding: 24px;
  max-width: 720px;
  margin: 0 auto;
}

.title {
  margin-bottom: 8px;
}

.message {
  color: #555;
}

.message.error {
  color: #b91c1c;
}

button {
  margin-top: 12px;
  cursor: pointer;
}
`;

const DEFAULT_DATA_LEGACY = `export async function load({ request, nonlaagents, query }) {
  return {
    title: "Hello Site",
    message: "Edit app.tsx, data.ts, styles.css, and actions.ts — then Approve to publish.",
  };
}
`;

const DEFAULT_ACTIONS_LEGACY = `export async function action({ request, nonlaagents }) {
  const contentType = request.headers.get("content-type") || "";
  let body = {};
  if (contentType.includes("application/json")) {
    body = await request.json().catch(() => ({}));
  } else {
    const fd = await request.formData();
    body = Object.fromEntries(fd.entries());
  }
  if (body._action === "ping") {
    return { ok: true, message: "pong" };
  }
  return { ok: false, message: "No actions defined yet" };
}
`;

function defaultPackageJson(slug: string) {
  return `${JSON.stringify(
    {
      name: `site-${slug}`,
      private: true,
      type: "module",
      dependencies: {
        react: "^19.1.0",
        "react-dom": "^19.1.0",
      },
    },
    null,
    2,
  )}\n`;
}

/** Merge legacy load/action modules into a single handle() export. */
export function composeBackendFromLoadAction(dataTs: string, actionsTs: string): string {
  const loadBody = dataTs.replace(/export\s+async\s+function\s+loader\b/, "async function load").replace(/export\s+async\s+function\s+load\b/, "async function load");
  const actionBody = actionsTs.replace(/export\s+async\s+function\s+action\b/, "async function action");

  return `${loadBody.trim()}

${actionBody.trim()}

export async function handle({ request, nonlaagents, query, params }) {
  if (request.method === "GET" || request.method === "HEAD") {
    return load({ request, nonlaagents, query, params });
  }
  return action({ request, nonlaagents, params });
}
`;
}

export function getSitesRoot(): string {
  return join(getDataDir(), "sites");
}

export function getSiteRoot(siteId: string) {
  return join(getSitesRoot(), siteId);
}

export function getTreeDir(siteId: string, tree: SiteTree) {
  const root = getSiteRoot(siteId);
  return tree === "draft" ? join(root, "draft") : root;
}

export function isAllowedSourceFile(name: string): name is SiteSourceFile {
  return (SITE_SOURCE_FILES as readonly string[]).includes(name);
}

export function readSourceFile(siteId: string, tree: SiteTree, file: SiteSourceFile): string {
  const path = join(getTreeDir(siteId, tree), file);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

export function writeSourceFile(siteId: string, tree: SiteTree, file: SiteSourceFile, content: string): void {
  if (!isAllowedSourceFile(file)) throw new Error(`Invalid site file: ${file}`);
  const dir = getTreeDir(siteId, tree);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), content, "utf8");
}

export function readAllSourceFiles(siteId: string, tree: SiteTree): Record<SiteSourceFile, string> {
  const out = {} as Record<SiteSourceFile, string>;
  for (const file of SITE_SOURCE_FILES) {
    out[file] = readSourceFile(siteId, tree, file);
  }
  return out;
}

export function writeScaffold(siteId: string, slug: string): void {
  const prod = getTreeDir(siteId, "prod");
  const draft = getTreeDir(siteId, "draft");
  mkdirSync(prod, { recursive: true });
  mkdirSync(draft, { recursive: true });

  const files: Record<SiteSourceFile, string> = {
    "app.tsx": DEFAULT_APP,
    "backend.ts": DEFAULT_BACKEND,
    "styles.css": DEFAULT_STYLES,
    "package.json": defaultPackageJson(slug),
  };

  for (const [file, content] of Object.entries(files) as [SiteSourceFile, string][]) {
    writeFileSync(join(prod, file), content, "utf8");
    writeFileSync(join(draft, file), content, "utf8");
  }
}

function copySourceFiles(fromDir: string, toDir: string, files: readonly SiteSourceFile[] = SITE_SOURCE_FILES): void {
  mkdirSync(toDir, { recursive: true });
  for (const file of files) {
    const src = join(fromDir, file);
    if (existsSync(src)) copyFileSync(src, join(toDir, file));
  }
}

/** Promote draft source → prod (does not copy node_modules). */
export function promoteDraftToProd(siteId: string, files?: readonly SiteSourceFile[]): void {
  copySourceFiles(getTreeDir(siteId, "draft"), getTreeDir(siteId, "prod"), files);
}

/** Reset draft source from prod. */
export function discardDraft(siteId: string, files?: readonly SiteSourceFile[]): void {
  copySourceFiles(getTreeDir(siteId, "prod"), getTreeDir(siteId, "draft"), files);
}

export function removeSiteDir(siteId: string): void {
  const root = getSiteRoot(siteId);
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
}

export function treeContentHash(siteId: string, tree: SiteTree): string {
  const hash = new Bun.CryptoHasher("sha256");
  for (const file of SITE_SOURCE_FILES) {
    hash.update(file);
    hash.update("\0");
    hash.update(readSourceFile(siteId, tree, file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function isDraftDirty(siteId: string): boolean {
  return treeContentHash(siteId, "draft") !== treeContentHash(siteId, "prod");
}

export function treeMtimeToken(siteId: string, tree: SiteTree): string {
  const dir = getTreeDir(siteId, tree);
  let max = 0;
  for (const file of SITE_SOURCE_FILES) {
    const p = join(dir, file);
    if (!existsSync(p)) continue;
    max = Math.max(max, statSync(p).mtimeMs);
  }
  return String(max);
}

export function listSiteDir(siteId: string): string[] {
  const root = getSiteRoot(siteId);
  if (!existsSync(root)) return [];
  return readdirSync(root);
}

export function treeHasReactApp(siteId: string, tree: SiteTree): boolean {
  return existsSync(join(getTreeDir(siteId, tree), "app.tsx"));
}

export function treeHasLegacyRemix(siteId: string, tree: SiteTree): boolean {
  const dir = getTreeDir(siteId, tree);
  return existsSync(join(dir, "route.jsx")) || existsSync(join(dir, "loader.js"));
}

function treeHasSplitBackend(siteId: string, tree: SiteTree): boolean {
  const dir = getTreeDir(siteId, tree);
  return existsSync(join(dir, "data.ts")) || existsSync(join(dir, "actions.ts"));
}

function treeHasUnifiedBackend(siteId: string, tree: SiteTree): boolean {
  return existsSync(join(getTreeDir(siteId, tree), "backend.ts"));
}

/** Migrate data.ts + actions.ts → backend.ts (once). */
export function migrateSplitBackendTree(siteId: string, tree: SiteTree): boolean {
  if (treeHasUnifiedBackend(siteId, tree)) {
    // Clean leftover split files if backend already exists
    const dir = getTreeDir(siteId, tree);
    let cleaned = false;
    for (const file of SITE_SPLIT_BACKEND_FILES) {
      const p = join(dir, file);
      if (existsSync(p)) {
        rmSync(p);
        cleaned = true;
      }
    }
    return cleaned;
  }
  if (!treeHasSplitBackend(siteId, tree)) return false;

  const dir = getTreeDir(siteId, tree);
  const dataTs = existsSync(join(dir, "data.ts")) ? readFileSync(join(dir, "data.ts"), "utf8") : DEFAULT_DATA_LEGACY;
  const actionsTs = existsSync(join(dir, "actions.ts")) ? readFileSync(join(dir, "actions.ts"), "utf8") : DEFAULT_ACTIONS_LEGACY;

  const legacyDir = join(dir, ".legacy-split-backend");
  mkdirSync(legacyDir, { recursive: true });
  for (const file of SITE_SPLIT_BACKEND_FILES) {
    const src = join(dir, file);
    if (existsSync(src)) copyFileSync(src, join(legacyDir, file));
  }

  writeFileSync(join(dir, "backend.ts"), composeBackendFromLoadAction(dataTs, actionsTs), "utf8");
  for (const file of SITE_SPLIT_BACKEND_FILES) {
    const p = join(dir, file);
    if (existsSync(p)) rmSync(p);
  }
  return true;
}

/**
 * One-shot migrate Remix-shaped sources → Hono/React files.
 * Wraps old Route in a client App that calls loadSiteData().
 */
export function migrateLegacyTree(siteId: string, tree: SiteTree, slug: string): boolean {
  if (treeHasReactApp(siteId, tree)) return false;
  if (!treeHasLegacyRemix(siteId, tree)) {
    writeScaffold(siteId, slug);
    return true;
  }

  const dir = getTreeDir(siteId, tree);
  const route = existsSync(join(dir, "route.jsx")) ? readFileSync(join(dir, "route.jsx"), "utf8") : "";
  const loader = existsSync(join(dir, "loader.js")) ? readFileSync(join(dir, "loader.js"), "utf8") : DEFAULT_DATA_LEGACY;
  const action = existsSync(join(dir, "action.js")) ? readFileSync(join(dir, "action.js"), "utf8") : DEFAULT_ACTIONS_LEGACY;
  const styles = existsSync(join(dir, "styles.css")) ? readFileSync(join(dir, "styles.css"), "utf8") : DEFAULT_STYLES;
  const pkg = existsSync(join(dir, "package.json")) ? readFileSync(join(dir, "package.json"), "utf8") : defaultPackageJson(slug);

  const legacyDir = join(dir, ".legacy-remix");
  mkdirSync(legacyDir, { recursive: true });
  for (const file of ["loader.js", "route.jsx", "action.js"] as const) {
    const src = join(dir, file);
    if (existsSync(src)) copyFileSync(src, join(legacyDir, file));
  }

  const dataTs = loader.includes("export async function load") ? loader : loader.replace(/export\s+async\s+function\s+loader\b/, "export async function load");
  const actionsTs = action.includes("export async function action") ? action : DEFAULT_ACTIONS_LEGACY;

  const routeBody = route.trim()
    ? route
        .replace(/export\s+default\s+function\s+Route\b/, "function Route")
        .replace(/from\s+["']\.\/ra-ui\.jsx["']/g, 'from "./site-api.js"')
        .replace(/\bRaForm\b/g, "form")
        .replace(/\bRaSubmit\b/g, "button")
    : `function Route({ loaderData }) {
  return (
    <div className="page">
      <h1 className="title">{loaderData?.title ?? "Site"}</h1>
      <p className="message">{loaderData?.message ?? ""}</p>
    </div>
  );
}
`;

  const appTsx = `import { useEffect, useState } from "react";
import { loadSiteData } from "./site-api.js";

${routeBody}

export default function App() {
  const [loaderData, setLoaderData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadSiteData()
      .then(setLoaderData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) return <div className="page"><p className="message">{error}</p></div>;
  if (!loaderData) return <div className="page"><p className="message">Loading…</p></div>;
  return <Route loaderData={loaderData} />;
}
`;

  writeFileSync(join(dir, "app.tsx"), appTsx, "utf8");
  writeFileSync(join(dir, "backend.ts"), composeBackendFromLoadAction(dataTs, actionsTs), "utf8");
  writeFileSync(join(dir, "styles.css"), styles, "utf8");
  writeFileSync(join(dir, "package.json"), pkg, "utf8");

  for (const file of SITE_LEGACY_FILES) {
    const p = join(dir, file);
    if (existsSync(p)) rmSync(p);
  }
  for (const file of SITE_SPLIT_BACKEND_FILES) {
    const p = join(dir, file);
    if (existsSync(p)) rmSync(p);
  }
  return true;
}

export function ensureReactSiteSources(siteId: string, slug: string): void {
  for (const tree of ["draft", "prod"] as SiteTree[]) {
    migrateLegacyTree(siteId, tree, slug);
    migrateSplitBackendTree(siteId, tree);
    if (!treeHasReactApp(siteId, tree) || !treeHasUnifiedBackend(siteId, tree)) {
      // Incomplete tree — write missing scaffold files without clobbering existing
      const dir = getTreeDir(siteId, tree);
      mkdirSync(dir, { recursive: true });
      if (!existsSync(join(dir, "app.tsx"))) writeFileSync(join(dir, "app.tsx"), DEFAULT_APP, "utf8");
      if (!existsSync(join(dir, "backend.ts"))) writeFileSync(join(dir, "backend.ts"), DEFAULT_BACKEND, "utf8");
      if (!existsSync(join(dir, "styles.css"))) writeFileSync(join(dir, "styles.css"), DEFAULT_STYLES, "utf8");
      if (!existsSync(join(dir, "package.json"))) writeFileSync(join(dir, "package.json"), defaultPackageJson(slug), "utf8");
    }
  }
}
