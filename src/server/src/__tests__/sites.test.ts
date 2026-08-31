import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import type { Hono } from "hono";
import { tmpDir } from "../common/utils/data-dir.js";
import { authRequest, createTestApp, setupAdmin } from "./test-helpers.js";

describe("Sites API", () => {
  let app: Hono;
  let cleanup: () => void;
  let token: string;
  let dataDir: string;
  let prevDataDir: string | undefined;

  beforeAll(async () => {
    prevDataDir = process.env.DATA_DIR;
    dataDir = `${tmpDir()}/nonla-agents-sites-${crypto.randomUUID()}`;
    process.env.DATA_DIR = dataDir;

    const t = createTestApp();
    app = t.app;
    cleanup = t.cleanup;
    const admin = await setupAdmin(app);
    token = admin.token;
  });

  afterAll(() => {
    cleanup();
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("CRUD + draft/approve + public live HTML", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "News",
      slug: "news",
    });
    expect(createRes.status).toBe(201);
    const site = (await createRes.json()) as {
      id: string;
      slug: string;
      isPublished: boolean;
      draftDirty: boolean;
      depsStatus: string;
    };
    expect(site.slug).toBe("news");
    expect(site.isPublished).toBe(false);

    const filesRes = await authRequest(app, token, "GET", `/api/sites/${site.id}/files`);
    expect(filesRes.status).toBe(200);
    const files = (await filesRes.json()) as { files: Record<string, string>; draftDirty: boolean };
    expect(files.files["backend.ts"]).toContain("export async function handle");
    expect(files.files["app.tsx"]).toContain("export default function App");
    expect(files.files["styles.css"]).toContain(".page");
    expect(files.files["app.tsx"]).toContain("loadSiteData");
    expect(files.files["data.ts"]).toBeUndefined();
    expect(files.files["actions.ts"]).toBeUndefined();

    const draftBackend = `export async function handle({ request }) {
  if (request.method === "GET" || request.method === "HEAD") {
    return { title: "Draft Title", message: "from draft" };
  }
  return { ok: false, message: "unknown" };
}
`;
    const putRes = await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/backend.ts`, {
      content: draftBackend,
      tree: "draft",
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { draftDirty: boolean };
    expect(putBody.draftDirty).toBe(true);

    const draftApp = `import { useEffect, useState } from "react";
import { loadSiteData } from "./site-api.js";
export default function App() {
  const [data, setData] = useState(null);
  useEffect(() => { loadSiteData().then(setData); }, []);
  if (!data) return <div className="hero">Loading</div>;
  return (<div className="hero"><h1>{data.title}</h1><p>{data.message}</p></div>);
}
`;
    await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/app.tsx`, {
      content: draftApp,
      tree: "draft",
    });
    await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/styles.css`, {
      content: ".hero { color: #b91c1c; }\n",
      tree: "draft",
    });

    const previewRes = await authRequest(app, token, "POST", `/api/sites/${site.id}/preview`, {});
    expect(previewRes.status).toBe(200);
    const preview = (await previewRes.json()) as { html: string; data: { title?: string } };
    expect(preview.html).toContain('id="root"');
    expect(preview.html).toContain("ra-site-api");
    expect(preview.html).not.toContain("__RA_SITE_DATA__");
    expect(preview.html).not.toContain("Draft Title");
    expect(preview.data?.title).toBe("Draft Title");

    const liveRes = await authRequest(app, token, "GET", `/api/sites/${site.id}/live`);
    expect(liveRes.status).toBe(200);
    expect(liveRes.headers.get("set-cookie")).toContain("ra_access_token=");
    const liveHtml = await liveRes.text();
    expect(liveHtml).toContain('id="root"');
    expect(liveHtml).toContain("/live/assets/app.js");
    expect(liveHtml).not.toContain("__RA_SITE_DATA__");
    expect(liveHtml).not.toContain("Draft Title");
    expect(liveHtml).not.toContain("access_token=");

    const sessionRes = await authRequest(app, token, "POST", `/api/sites/${site.id}/live/session`, {});
    expect(sessionRes.status).toBe(200);
    const setCookie = sessionRes.headers.get("set-cookie") ?? "";
    const cookiePair = setCookie.split(";")[0] ?? "";
    const cookieAsset = await app.request(`/api/sites/${site.id}/live/assets/styles.css`, {
      headers: { Cookie: cookiePair },
    });
    expect(cookieAsset.status).toBe(200);

    const assetRes = await authRequest(app, token, "GET", `/api/sites/${site.id}/live/assets/app.js`);
    expect(assetRes.status).toBe(200);
    const appJs = await assetRes.text();
    expect(appJs.length).toBeGreaterThan(100);

    const dataRes = await authRequest(app, token, "GET", `/api/sites/${site.id}/data`);
    expect(dataRes.status).toBe(200);
    const dataBody = (await dataRes.json()) as { data: { title: string } };
    expect(dataBody.data.title).toBe("Draft Title");

    const pub404 = await app.request("/api/public/sites/news");
    expect(pub404.status).toBe(404);

    await authRequest(app, token, "PUT", `/api/sites/${site.id}`, { isPublished: true });

    const pubBefore = await app.request("/public/sites/news");
    expect(pubBefore.status).toBe(200);
    const pubBeforeHtml = await pubBefore.text();
    expect(pubBeforeHtml).toContain('id="root"');
    expect(pubBeforeHtml).not.toContain("Draft Title");

    const approveRes = await authRequest(app, token, "POST", `/api/sites/${site.id}/approve`, {});
    expect(approveRes.status).toBe(200);

    const prodFilesRes = await authRequest(app, token, "GET", `/api/sites/${site.id}/files?tree=prod`);
    const prodFiles = (await prodFilesRes.json()) as { files: Record<string, string> };
    expect(prodFiles.files["backend.ts"]).toContain("Draft Title");

    const pubAfter = await app.request("/public/sites/news");
    expect(pubAfter.status).toBe(200);
    const pubAfterHtml = await pubAfter.text();
    expect(pubAfterHtml).toContain('id="root"');
    expect(pubAfterHtml).toContain("/public/sites/news/assets/app.js");

    const pubData = await app.request("/api/public/sites/news/data");
    expect(pubData.status).toBe(200);
    expect(((await pubData.json()) as { data: { title: string } }).data.title).toBe("Draft Title");

    await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/backend.ts`, {
      content: `export async function handle({ request }) {
  if (request.method === "GET" || request.method === "HEAD") return { title: "Temp", message: "x" };
  return { ok: false };
}
`,
      tree: "draft",
    });
    const discardRes = await authRequest(app, token, "POST", `/api/sites/${site.id}/discard`, {});
    expect(discardRes.status).toBe(200);
    const filesAfterDiscard = await authRequest(app, token, "GET", `/api/sites/${site.id}/files`);
    const discarded = (await filesAfterDiscard.json()) as { files: Record<string, string>; draftDirty: boolean };
    expect(discarded.files["backend.ts"]).toContain("Draft Title");
    expect(discarded.draftDirty).toBe(false);

    const delRes = await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
    expect(delRes.status).toBe(200);
  }, 180_000);

  test("public site password gate", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "Secret",
      slug: "secret-site",
    });
    expect(createRes.status).toBe(201);
    const site = (await createRes.json()) as { id: string };

    await authRequest(app, token, "PUT", `/api/sites/${site.id}`, {
      isPublished: true,
      publicPassword: "s3cret",
    });

    const lockedDoc = await app.request("/public/sites/secret-site");
    expect(lockedDoc.status).toBe(200);
    expect(await lockedDoc.text()).toContain("Enter password");

    const lockedApi = await app.request("/api/public/sites/secret-site");
    expect(lockedApi.status).toBe(200);
    const locked = (await lockedApi.json()) as { locked?: boolean; requiresPassword?: boolean };
    expect(locked.locked).toBe(true);
    expect(locked.requiresPassword).toBe(true);

    const okVerify = await app.request("/api/public/sites/secret-site/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "s3cret" }),
    });
    expect(okVerify.status).toBe(200);
    const verified = (await okVerify.json()) as { valid: boolean; token?: string };
    expect(verified.valid).toBe(true);
    expect(verified.token).toBeTruthy();
    const setCookie = okVerify.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("ra_site_token_secret-site=");
    expect(setCookie).toContain("HttpOnly");

    const openDoc = await app.request("/public/sites/secret-site", {
      headers: { Cookie: `ra_site_token_secret-site=${verified.token}` },
    });
    expect(openDoc.status).toBe(200);
    const openHtml = await openDoc.text();
    expect(openHtml).toContain('id="root"');
    expect(openHtml).not.toContain("site_token=");

    // Legacy ?site_token= redirects to clean URL and sets cookie
    const legacyRedirect = await app.request(`/public/sites/secret-site?site_token=${verified.token}`);
    expect(legacyRedirect.status).toBe(302);
    expect(legacyRedirect.headers.get("location")).toBe("/public/sites/secret-site");
    expect(legacyRedirect.headers.get("set-cookie") ?? "").toContain("ra_site_token_secret-site=");

    // Password change must invalidate old tokens
    await authRequest(app, token, "PUT", `/api/sites/${site.id}`, {
      publicPassword: "n3w-secret",
    });
    const staleDoc = await app.request("/public/sites/secret-site", {
      headers: { Cookie: `ra_site_token_secret-site=${verified.token}` },
    });
    expect(staleDoc.status).toBe(200);
    const staleHtml = await staleDoc.text();
    expect(staleHtml).toContain("Enter password");
    expect(staleHtml).toContain("verify-token");
    expect(staleDoc.headers.get("set-cookie") ?? "").toContain("Max-Age=0");

    const staleVerify = await app.request("/api/public/sites/secret-site/verify-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: verified.token }),
    });
    expect(staleVerify.status).toBe(200);
    expect(((await staleVerify.json()) as { valid: boolean }).valid).toBe(false);
    expect(staleVerify.headers.get("set-cookie") ?? "").toContain("Max-Age=0");

    await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
  }, 180_000);

  test("preview works when styles.css is missing (legacy sites)", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "Legacy CSS",
      slug: "legacy-css",
    });
    expect(createRes.status).toBe(201);
    const site = (await createRes.json()) as { id: string };

    const { unlinkSync: unlink } = await import("node:fs");
    const { getTreeDir } = await import("../modules/sites/sites-fs.js");
    unlink(`${getTreeDir(site.id, "draft")}/styles.css`);

    const previewRes = await authRequest(app, token, "POST", `/api/sites/${site.id}/preview`, {});
    expect(previewRes.status).toBe(200);
    const preview = (await previewRes.json()) as { html: string };
    expect(preview.html).toContain('id="root"');

    await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
  }, 180_000);

  test("member cannot access another users site", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "Admin Only",
      slug: "admin-only-site",
    });
    const site = (await createRes.json()) as { id: string };

    const setupRes = await app.request("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "member1", password: "password123", timezone: "UTC" }),
    });
    // setup may fail if already done — create member via admin if needed
    let memberToken = "";
    if (setupRes.status === 200) {
      memberToken = ((await setupRes.json()) as { token: string }).token;
    } else {
      const login = await app.request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "member1", password: "password123" }),
      });
      if (login.status === 200) {
        memberToken = ((await login.json()) as { token: string }).token;
      }
    }

    if (memberToken) {
      const denied = await authRequest(app, memberToken, "GET", `/api/sites/${site.id}`);
      expect([403, 404]).toContain(denied.status);
    }

    await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
  }, 180_000);

  test("draft action via JSON", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "Actions",
      slug: "actions-site",
    });
    const site = (await createRes.json()) as { id: string };

    await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/backend.ts`, {
      content: `export async function handle({ request }) {
  if (request.method === "GET" || request.method === "HEAD") {
    return { title: "Actions", message: "hi" };
  }
  const body = await request.json();
  if (body._action === "ping") return { ok: true, message: "pong" };
  return { ok: false, message: "unknown" };
}
`,
      tree: "draft",
    });

    const actionRes = await authRequest(app, token, "POST", `/api/sites/${site.id}/action`, {
      _action: "ping",
    });
    expect(actionRes.status).toBe(200);
    const actionBody = (await actionRes.json()) as { result: { ok: boolean; message: string } };
    expect(actionBody.result.ok).toBe(true);
    expect(actionBody.result.message).toBe("pong");

    await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
  }, 180_000);

  test("GET /api/sites/:id/data — hung handle times out without killing the server", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "Hang",
      slug: "hang-site",
    });
    const site = (await createRes.json()) as { id: string };

    await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/backend.ts`, {
      content: `export async function handle() {
  await Bun.sleep(60_000);
}
`,
      tree: "draft",
    });

    const prevTimeout = process.env.SITE_BACKEND_TIMEOUT_MS;
    process.env.SITE_BACKEND_TIMEOUT_MS = "1500";
    try {
      const dataRes = await authRequest(app, token, "GET", `/api/sites/${site.id}/data`);
      expect(dataRes.status).toBe(400);
      const body = (await dataRes.json()) as { message?: string };
      expect(body.message ?? "").toMatch(/timed out/i);

      const stillUp = await authRequest(app, token, "GET", `/api/sites/${site.id}`);
      expect(stillUp.status).toBe(200);
      expect(((await stillUp.json()) as { id: string }).id).toBe(site.id);
    } finally {
      if (prevTimeout === undefined) delete process.env.SITE_BACKEND_TIMEOUT_MS;
      else process.env.SITE_BACKEND_TIMEOUT_MS = prevTimeout;
    }

    await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
  }, 30_000);

  test("collectSiteEditorDiagnostics reports TS and JSON errors from draft files", async () => {
    const { collectSiteEditorDiagnostics } = await import("../modules/sites/common/site-editor-diagnostics.js");
    const { removeSiteDir, writeScaffold, writeSourceFile } = await import("../modules/sites/sites-fs.js");
    const id = "diag-draft-site";
    writeScaffold(id, "diag-draft");
    try {
      expect(collectSiteEditorDiagnostics(id)).toEqual([]);

      writeSourceFile(id, "draft", "app.tsx", "export default function App() {\n  return <div>{missingIdent}</div>;\n}\n");
      const tsErrors = collectSiteEditorDiagnostics(id);
      expect(tsErrors.some((d) => d.file === "app.tsx" && /missingIdent/.test(d.message))).toBe(true);

      writeSourceFile(id, "draft", "package.json", '{ "name": "broken", ');
      const jsonErrors = collectSiteEditorDiagnostics(id);
      expect(jsonErrors.some((d) => d.file === "package.json")).toBe(true);
    } finally {
      removeSiteDir(id);
    }
  });

  test("POST /api/sites/:id/approve — single file leaves other draft changes", async () => {
    const createRes = await authRequest(app, token, "POST", "/api/sites", {
      name: "Partial",
      slug: "partial-approve",
    });
    expect(createRes.status).toBe(201);
    const site = (await createRes.json()) as { id: string };

    await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/app.tsx`, {
      content: "export default function App() { return <div>OnlyApp</div>; }\n",
      tree: "draft",
    });
    await authRequest(app, token, "PUT", `/api/sites/${site.id}/files/styles.css`, {
      content: ".only-css { color: red; }\n",
      tree: "draft",
    });

    const badFile = await authRequest(app, token, "POST", `/api/sites/${site.id}/approve`, { file: "secret.txt" });
    expect(badFile.status).toBe(400);

    const approveRes = await authRequest(app, token, "POST", `/api/sites/${site.id}/approve`, { file: "app.tsx" });
    expect(approveRes.status).toBe(200);
    const approved = (await approveRes.json()) as { draftDirty: boolean };
    expect(approved.draftDirty).toBe(true);

    const prodFilesRes = await authRequest(app, token, "GET", `/api/sites/${site.id}/files?tree=prod`);
    const prodFiles = (await prodFilesRes.json()) as { files: Record<string, string> };
    expect(prodFiles.files["app.tsx"]).toContain("OnlyApp");
    expect(prodFiles.files["styles.css"]).not.toContain("only-css");

    const discardRes = await authRequest(app, token, "POST", `/api/sites/${site.id}/discard`, { file: "styles.css" });
    expect(discardRes.status).toBe(200);
    const discarded = (await discardRes.json()) as { draftDirty: boolean };
    expect(discarded.draftDirty).toBe(false);

    const draftFilesRes = await authRequest(app, token, "GET", `/api/sites/${site.id}/files`);
    const draftFiles = (await draftFilesRes.json()) as { files: Record<string, string> };
    expect(draftFiles.files["styles.css"]).not.toContain("only-css");
    expect(draftFiles.files["app.tsx"]).toContain("OnlyApp");

    await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
  }, 180_000);

  test("POST /api/sites — Vietnamese slug keeps letters after stripping diacritics", async () => {
    const res = await authRequest(app, token, "POST", "/api/sites", {
      name: "Công cụ tin tức",
      slug: "Công cụ tin tức",
    });
    expect(res.status).toBe(201);
    const site = (await res.json()) as { id: string; slug: string };
    expect(site.slug).toBe("cong-cu-tin-tuc");
    await authRequest(app, token, "DELETE", `/api/sites/${site.id}`);
  });
});

describe("normalizeSiteFormActions + rewriteRequestToSitePath", () => {
  test("POST forms get empty action, data-site-action, data-site-path", async () => {
    const { normalizeSiteFormActions } = await import("../modules/sites/common/normalize-site-forms.js");
    const html = `<form action="/submit" method="post"><button>Go</button></form>`;
    const out = normalizeSiteFormActions(html, "/public/sites/demo");
    expect(out).toContain('method="post"');
    expect(out).toContain("data-site-action");
    expect(out).toContain('data-site-path="/public/sites/demo"');
    expect(out).toContain('action=""');
    expect(out).not.toContain("/submit");
  });

  test("rewriteRequestToSitePath preserves method, search, and body", async () => {
    const { rewriteRequestToSitePath } = await import("../modules/sites/common/normalize-site-forms.js");
    const body = new URLSearchParams({ name: "Ada", _action: "create" });
    const incoming = new Request("http://host/api/public/sites/demo/action?ref=1", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const rewritten = await rewriteRequestToSitePath(incoming, "/public/sites/demo");
    expect(rewritten.url).toBe("http://site.local/public/sites/demo?ref=1");
    expect(rewritten.method).toBe("POST");
    const text = await rewritten.text();
    expect(text).toContain("name=Ada");
  });
});
