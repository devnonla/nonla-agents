import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { getDb, sites } from "../../common/db/client.js";
import { listQuery } from "../../common/db/list-query.util.js";
import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from "../../common/exceptions/http.exception.js";
import { requestOrigin } from "../../common/spa-html.js";
import { slugify } from "../../common/utils/slug.js";
import { wsHub } from "../../common/ws/wsHub.js";
import { resolveSiteSelection } from "./common/resolve-selection.js";
import { buildSiteBundle, buildSiteShellHtml, buildSiteUnlockHtml, invalidateSiteCaches as invalidateBundleCaches } from "./sites-bundle.js";
import { invalidateSiteDataModules, runSiteActionModule, runSiteLoad } from "./sites-data-runtime.js";
import { installSiteDeps } from "./sites-deps.js";
import { type SiteSourceFile, type SiteTree, discardDraft, ensureReactSiteSources, isAllowedSourceFile, isDraftDirty, promoteDraftToProd, readAllSourceFiles, removeSiteDir, writeScaffold, writeSourceFile } from "./sites-fs.js";
import { readSiteThumbnailPng, writeSiteThumbnailPng } from "./sites-thumbnail.js";

function sitePublicPath(slug: string) {
  return `/public/sites/${slug}`;
}

export function invalidateSiteCaches(siteId: string) {
  invalidateBundleCaches(siteId);
  invalidateSiteDataModules(siteId);
}

type SiteRow = typeof sites.$inferSelect;

export type SiteActor = { id: string; role: string };

export function assertSiteAccess(site: SiteRow, user: SiteActor) {
  if (user.role === "admin") return;
  if (site.createdBy === user.id) return;
  throw new ForbiddenException("Forbidden");
}

export function requireSiteAccess(id: string, user: SiteActor) {
  const site = getSiteOrThrow(id);
  assertSiteAccess(site, user);
  return site;
}

function siteRequiresPassword(site: SiteRow) {
  return !!(site.publicPassword && site.publicPassword.length > 0);
}

function getSiteTokenSecret(storedPassword: string): Uint8Array {
  return new TextEncoder().encode(`site_public_access::${storedPassword}`);
}

async function generateSiteToken(siteId: string, storedPassword: string): Promise<string> {
  return new SignJWT({ siteId, scope: "site-public" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("24h").sign(getSiteTokenSecret(storedPassword));
}

export async function verifySitePublicToken(siteId: string, token: string): Promise<boolean> {
  const site = getSiteOrThrow(siteId);
  if (!site.isPublished || !siteRequiresPassword(site)) return false;
  try {
    const { payload } = await jwtVerify(token, getSiteTokenSecret(site.publicPassword!));
    return (payload as { siteId?: string; scope?: string }).siteId === siteId && (payload as { scope?: string }).scope === "site-public";
  } catch {
    return false;
  }
}

async function hasSitePublicAccess(site: SiteRow, opts?: { password?: string; token?: string }) {
  if (!siteRequiresPassword(site)) return true;
  if (opts?.password) {
    const ok = await verifyStoredPublicPassword(site.publicPassword!, opts.password);
    if (ok) return true;
  }
  if (opts?.token) return verifySitePublicToken(site.id, opts.token);
  return false;
}

export async function verifySitePublicPassword(slug: string, password?: string) {
  const site = getSiteBySlug(slug);
  if (!site.isPublished) throw new NotFoundException("Site not found");
  if (siteRequiresPassword(site)) {
    if (!password || !(await verifyStoredPublicPassword(site.publicPassword!, password))) {
      throw new BadRequestException("Incorrect password");
    }
    // Migrate legacy plaintext to hash on successful verify
    if (!isPasswordHash(site.publicPassword!)) {
      const hashed = await hashPublicPassword(password);
      getDb().update(sites).set({ publicPassword: hashed, updatedAt: new Date() }).where(eq(sites.id, site.id)).run();
      site.publicPassword = hashed;
    }
  }
  const token = siteRequiresPassword(site) ? await generateSiteToken(site.id, site.publicPassword!) : undefined;
  return { valid: true as const, token, siteId: site.id };
}

export async function verifySitePublicAccessToken(slug: string, token?: string) {
  const site = getSiteBySlug(slug);
  if (!site.isPublished) return { valid: false };
  if (!token) return { valid: false };
  return { valid: await verifySitePublicToken(site.id, token) };
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSlug(slug: string) {
  const s = slugify(slug ?? "");
  if (!s) throw new BadRequestException("slug is required");
  if (s.length > 80) throw new BadRequestException("slug is too long");
  if (!SLUG_RE.test(s)) throw new BadRequestException("slug must be lowercase alphanumeric with hyphens");
  return s;
}

function assertName(name: string) {
  const n = name?.trim() ?? "";
  if (!n) throw new BadRequestException("name is required");
  if (n.length > 120) throw new BadRequestException("name is too long");
  return n;
}

function getSiteOrThrow(id: string) {
  const db = getDb();
  const row = db.select().from(sites).where(eq(sites.id, id)).get();
  if (!row) throw new NotFoundException("Site not found");
  return row;
}

function withDirty<T extends { id: string }>(row: T) {
  return { ...row, draftDirty: isDraftDirty(row.id) };
}

function isPasswordHash(value: string) {
  return value.startsWith("$argon2") || value.startsWith("$bcrypt") || value.startsWith("$2");
}

function toSiteResponse<T extends SiteRow>(row: T) {
  const dirty = withDirty(row);
  const { publicPassword, ...rest } = dirty;
  return {
    ...rest,
    hasPublicPassword: !!(publicPassword && publicPassword.length > 0),
  };
}

async function verifyStoredPublicPassword(stored: string, password: string): Promise<boolean> {
  if (isPasswordHash(stored)) {
    return Bun.password.verify(password, stored);
  }
  // Legacy plaintext — accept once then caller may rehash
  return stored === password;
}

async function hashPublicPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}

export function listSites(query: Record<string, string | undefined>, user?: SiteActor) {
  const ownerFilter = user && user.role !== "admin" ? eq(sites.createdBy, user.id) : undefined;
  const result = listQuery(
    {
      table: sites,
      searchColumns: ["name", "slug"],
      ...(ownerFilter ? { where: ownerFilter } : {}),
    },
    query,
  );
  return {
    ...result,
    items: result.items.map((row) => toSiteResponse(row)),
  };
}

export function getSite(id: string) {
  return toSiteResponse(getSiteOrThrow(id));
}

export function getSiteBySlug(slug: string) {
  const db = getDb();
  const row = db.select().from(sites).where(eq(sites.slug, slug.trim().toLowerCase())).get();
  if (!row) throw new NotFoundException("Site not found");
  return withDirty(row);
}

export async function createSite(body: { name?: string; slug?: string; createdBy?: string | null }) {
  const name = assertName(body.name ?? "");
  const slug = assertSlug(body.slug ?? "");
  const db = getDb();

  const existing = db.select().from(sites).where(eq(sites.slug, slug)).get();
  if (existing) throw new BadRequestException("slug already exists");

  const id = crypto.randomUUID();
  writeScaffold(id, slug);

  const [row] = db
    .insert(sites)
    .values({
      id,
      name,
      slug,
      isPublished: false,
      depsStatus: "installing",
      draftDepsStatus: "installing",
      createdBy: body.createdBy ?? null,
    })
    .returning()
    .all();

  wsHub.emit("sites:created", toSiteResponse(row));

  const prod = await installSiteDeps(id, "prod");
  const draft = await installSiteDeps(id, "draft");
  const [updated] = db
    .update(sites)
    .set({
      depsStatus: prod.ok ? "ready" : "error",
      depsError: prod.ok ? null : prod.error,
      draftDepsStatus: draft.ok ? "ready" : "error",
      draftDepsError: draft.ok ? null : draft.error,
      updatedAt: new Date(),
    })
    .where(eq(sites.id, id))
    .returning()
    .all();
  wsHub.emit("sites:updated", toSiteResponse(updated));

  return toSiteResponse(updated);
}

export async function updateSite(id: string, body: { name?: string; slug?: string; isPublished?: boolean; publicPassword?: string | null }) {
  const current = getSiteOrThrow(id);
  const db = getDb();
  const patch: Partial<typeof sites.$inferInsert> = { updatedAt: new Date() };

  if (body.name !== undefined) patch.name = assertName(body.name);
  if (body.slug !== undefined) {
    const slug = assertSlug(body.slug);
    if (slug !== current.slug) {
      const clash = db.select().from(sites).where(eq(sites.slug, slug)).get();
      if (clash) throw new BadRequestException("slug already exists");
      patch.slug = slug;
    }
  }
  if (body.isPublished !== undefined) patch.isPublished = Boolean(body.isPublished);
  if (body.publicPassword !== undefined) {
    const pw = body.publicPassword == null ? null : String(body.publicPassword);
    if (!pw || pw.length === 0) {
      patch.publicPassword = null;
    } else {
      patch.publicPassword = await hashPublicPassword(pw);
    }
  }

  const [row] = db.update(sites).set(patch).where(eq(sites.id, id)).returning().all();
  const safe = toSiteResponse(row);
  wsHub.emit("sites:updated", safe);
  return safe;
}

export function deleteSite(id: string) {
  getSiteOrThrow(id);
  const db = getDb();
  db.delete(sites).where(eq(sites.id, id)).run();
  removeSiteDir(id);
  invalidateSiteCaches(id);
  wsHub.emit("sites:deleted", { id });
  return { ok: true };
}

export function getSiteFiles(id: string, tree: SiteTree = "draft") {
  const site = getSiteOrThrow(id);
  ensureReactSiteSources(id, site.slug);
  return { tree, files: readAllSourceFiles(id, tree), draftDirty: isDraftDirty(id) };
}

export async function updateSiteFile(id: string, file: string, content: string, tree: SiteTree = "draft") {
  const site = getSiteOrThrow(id);
  ensureReactSiteSources(id, site.slug);
  if (tree === "prod") {
    throw new BadRequestException("Cannot write production files directly; edit draft and approve");
  }
  if (!isAllowedSourceFile(file)) throw new BadRequestException(`Invalid file: ${file}`);
  if (typeof content !== "string") throw new BadRequestException("content must be a string");
  writeSourceFile(id, tree, file as SiteSourceFile, content);
  invalidateSiteCaches(id);

  if (file === "package.json") {
    const site = await installDeps(id, tree);
    return { ok: true, file, tree, draftDirty: isDraftDirty(id), site, depsInstalled: true as const };
  }

  const db = getDb();
  const patch: Partial<typeof sites.$inferInsert> = { updatedAt: new Date() };
  if (tree === "draft") patch.draftUpdatedAt = new Date();
  const [row] = db.update(sites).set(patch).where(eq(sites.id, id)).returning().all();
  const safe = toSiteResponse(row);
  wsHub.emit("sites:updated", safe);
  return { ok: true, file, tree, draftDirty: isDraftDirty(id), site: safe, depsInstalled: false as const };
}

export async function installDeps(id: string, tree: SiteTree = "draft") {
  getSiteOrThrow(id);
  const db = getDb();
  if (tree === "draft") {
    db.update(sites).set({ draftDepsStatus: "installing", draftDepsError: null, updatedAt: new Date() }).where(eq(sites.id, id)).run();
  } else {
    db.update(sites).set({ depsStatus: "installing", depsError: null, updatedAt: new Date() }).where(eq(sites.id, id)).run();
  }

  const result = await installSiteDeps(id, tree);
  const [row] = db
    .update(sites)
    .set(
      tree === "draft"
        ? {
            draftDepsStatus: result.ok ? "ready" : "error",
            draftDepsError: result.ok ? null : result.error,
            updatedAt: new Date(),
          }
        : {
            depsStatus: result.ok ? "ready" : "error",
            depsError: result.ok ? null : result.error,
            updatedAt: new Date(),
          },
    )
    .where(eq(sites.id, id))
    .returning()
    .all();

  invalidateSiteCaches(id);
  const safe = toSiteResponse(row);
  wsHub.emit("sites:updated", safe);
  if (!result.ok) throw new BadRequestException(result.error);
  return safe;
}

function parseOptionalSourceFiles(file?: string): SiteSourceFile[] | undefined {
  if (file === undefined || file === "") return undefined;
  if (!isAllowedSourceFile(file)) throw new BadRequestException(`Invalid file: ${file}`);
  return [file];
}

export async function approveSite(id: string, file?: string) {
  getSiteOrThrow(id);
  const files = parseOptionalSourceFiles(file);
  promoteDraftToProd(id, files);
  invalidateSiteCaches(id);

  const needsInstall = !files || files.includes("package.json");
  if (!needsInstall) {
    const db = getDb();
    const [row] = db.update(sites).set({ updatedAt: new Date() }).where(eq(sites.id, id)).returning().all();
    const safe = toSiteResponse(row);
    wsHub.emit("sites:updated", safe);
    return safe;
  }

  const db = getDb();
  db.update(sites).set({ depsStatus: "installing", depsError: null, updatedAt: new Date() }).where(eq(sites.id, id)).run();

  const result = await installSiteDeps(id, "prod");
  const [row] = db
    .update(sites)
    .set({
      depsStatus: result.ok ? "ready" : "error",
      depsError: result.ok ? null : result.error,
      updatedAt: new Date(),
    })
    .where(eq(sites.id, id))
    .returning()
    .all();

  const safe = toSiteResponse(row);
  wsHub.emit("sites:updated", safe);
  if (!result.ok) throw new BadRequestException(`Approved but prod install failed: ${result.error}`);
  return safe;
}

export function discardSiteDraft(id: string, file?: string) {
  getSiteOrThrow(id);
  discardDraft(id, parseOptionalSourceFiles(file));
  invalidateSiteCaches(id);
  const db = getDb();
  const [row] = db.update(sites).set({ draftUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(sites.id, id)).returning().all();
  const safe = toSiteResponse(row);
  wsHub.emit("sites:updated", safe);
  return safe;
}

export async function getSiteThumbnailPng(id: string) {
  getSiteOrThrow(id);
  return readSiteThumbnailPng(id);
}

export async function saveSiteThumbnailPng(id: string, png: Buffer) {
  getSiteOrThrow(id);
  await writeSiteThumbnailPng(id, png);
  return { ok: true as const };
}

/** Bundle check / agent preview — returns shell HTML + backend GET data summary. */
export async function previewSite(id: string, query?: Record<string, string>, tree: SiteTree = "draft") {
  const site = getSiteOrThrow(id);
  ensureReactSiteSources(id, site.slug);
  const pageUrl = new URL(sitePublicPath(site.slug), "http://site.local");
  if (query) {
    for (const [k, v] of Object.entries(query)) pageUrl.searchParams.set(k, v);
  }
  const request = new Request(pageUrl.toString());
  const [{ data }, bundle] = await Promise.all([runSiteLoad(id, tree, { request, query: query ?? {} }), buildSiteBundle(id, tree)]);
  const html = buildSiteShellHtml({
    title: site.name,
    apiBase: tree === "draft" ? `/api/sites/${id}` : `/api/public/sites/${site.slug}`,
    slug: site.slug,
    assetBase: tree === "draft" ? `/api/sites/${id}/live/assets` : `/public/sites/${site.slug}/assets`,
  });
  return { html, data, cached: bundle.cached, appJsChars: bundle.appJs.length };
}

export async function runDraftAction(id: string, request: Request) {
  const site = getSiteOrThrow(id);
  ensureReactSiteSources(id, site.slug);
  return runSiteActionModule(id, "draft", { request });
}

export function resolveSelection(id: string, body: { sourceAnchor?: string; tagName?: string; className?: string; text?: string; outerHtml?: string }) {
  getSiteOrThrow(id);
  return resolveSiteSelection(id, body);
}

export async function loadPublicSiteData(slug: string, request: Request, access?: { password?: string; token?: string }) {
  const site = getSiteBySlug(slug);
  if (!site.isPublished) throw new NotFoundException("Site not found");
  const allowed = await hasSitePublicAccess(site, access);
  if (!allowed) throw new UnauthorizedException("Password required");
  ensureReactSiteSources(site.id, site.slug);
  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  return runSiteLoad(site.id, "prod", { request, query });
}

export async function loadDraftSiteData(id: string, request: Request) {
  const site = getSiteOrThrow(id);
  ensureReactSiteSources(id, site.slug);
  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  return runSiteLoad(id, "draft", { request, query });
}

/** HTML document for draft live preview (editor iframe). */
export async function renderDraftLiveHtml(id: string, _request?: Request) {
  const site = getSiteOrThrow(id);
  ensureReactSiteSources(id, site.slug);
  await buildSiteBundle(id, "draft");
  return buildSiteShellHtml({
    title: `${site.name} (draft)`,
    apiBase: `/api/sites/${id}`,
    slug: site.slug,
    assetBase: `/api/sites/${id}/live/assets`,
  });
}

export async function getDraftLiveAsset(id: string, file: "app.js" | "styles.css") {
  const site = getSiteOrThrow(id);
  ensureReactSiteSources(id, site.slug);
  const bundle = await buildSiteBundle(id, "draft");
  if (file === "app.js") return { body: bundle.appJs, contentType: "text/javascript; charset=utf-8" };
  return { body: bundle.css, contentType: "text/css; charset=utf-8" };
}

export async function renderPublicSiteDocument(slug: string, request: Request, access?: { password?: string; token?: string }) {
  const site = getSiteBySlug(slug);
  if (!site.isPublished) throw new NotFoundException("Site not found");
  ensureReactSiteSources(site.id, site.slug);
  const requiresPassword = siteRequiresPassword(site);
  const origin = requestOrigin(request) || undefined;
  const allowed = await hasSitePublicAccess(site, access);
  if (!allowed) {
    const url = new URL(request.url);
    const error = url.searchParams.get("e") ? "Incorrect password" : undefined;
    return {
      kind: "unlock" as const,
      html: buildSiteUnlockHtml({ title: site.name, slug: site.slug, error, origin }),
      requiresPassword: true,
    };
  }
  await buildSiteBundle(site.id, "prod");
  return {
    kind: "app" as const,
    html: buildSiteShellHtml({
      title: site.name,
      apiBase: `/api/public/sites/${site.slug}`,
      slug: site.slug,
      assetBase: `/public/sites/${site.slug}/assets`,
      origin,
    }),
    requiresPassword,
  };
}

export async function getPublicSiteAsset(slug: string, file: "app.js" | "styles.css", access?: { password?: string; token?: string }) {
  const site = getSiteBySlug(slug);
  if (!site.isPublished) throw new NotFoundException("Site not found");
  const allowed = await hasSitePublicAccess(site, access);
  if (!allowed) throw new UnauthorizedException("Password required");
  ensureReactSiteSources(site.id, site.slug);
  const bundle = await buildSiteBundle(site.id, "prod");
  if (file === "app.js") return { body: bundle.appJs, contentType: "text/javascript; charset=utf-8" };
  return { body: bundle.css, contentType: "text/css; charset=utf-8" };
}

/** @deprecated JSON HTML preview — kept for older clients; prefer live document. */
export async function renderPublicSite(slug: string, request: Request, access?: { password?: string; token?: string }) {
  const site = getSiteBySlug(slug);
  if (!site.isPublished) throw new NotFoundException("Site not found");
  const requiresPassword = siteRequiresPassword(site);
  const allowed = await hasSitePublicAccess(site, access);
  if (!allowed) {
    return {
      site: { id: site.id, name: site.name, slug: site.slug },
      requiresPassword: true,
      locked: true,
      html: "",
      data: null,
      cached: false,
    };
  }
  const doc = await renderPublicSiteDocument(slug, request, access);
  return {
    site: { id: site.id, name: site.name, slug: site.slug },
    requiresPassword,
    locked: false,
    html: doc.html,
    data: null,
    cached: false,
  };
}

export async function runPublicAction(slug: string, request: Request, access?: { password?: string; token?: string }) {
  const site = getSiteBySlug(slug);
  if (!site.isPublished) throw new NotFoundException("Site not found");
  const allowed = await hasSitePublicAccess(site, access);
  if (!allowed) throw new UnauthorizedException("Password required");
  ensureReactSiteSources(site.id, site.slug);
  return runSiteActionModule(site.id, "prod", { request });
}

export function readDraftFile(id: string, file: SiteSourceFile) {
  getSiteOrThrow(id);
  ensureReactSiteSources(id, getSiteOrThrow(id).slug);
  return readAllSourceFiles(id, "draft")[file];
}
