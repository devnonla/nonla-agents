import { readdirSync, rmSync } from "node:fs";
import { OMITTED_WRITE_MESSAGE, isOmittedSource } from "../../common/ai/apply-exact-replace.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { SANDBOX_TSCONFIG, rewriteSandboxTs } from "../../common/sandbox/index.js";
import { ogMetaTags } from "../../common/spa-html.js";
import { PLATFORM_ENTRY_SOURCE, PLATFORM_SITE_API_SOURCE } from "./platform/site-api-source.js";
import { SITE_RUNTIME_FILES, type SiteTree, getTreeDir, readSourceFile, treeContentHash } from "./sites-fs.js";

const importGeneration = new Map<string, number>();
const BUNDLE_REV = "react-v10-omit-css";

function join(...parts: string[]): string {
  return parts.join("/");
}

function treeKey(siteId: string, tree: SiteTree) {
  return `${siteId}:${tree}`;
}

export function invalidateSiteCaches(siteId: string) {
  for (const tree of ["prod", "draft"] as SiteTree[]) {
    const tk = treeKey(siteId, tree);
    importGeneration.set(tk, (importGeneration.get(tk) ?? 0) + 1);
  }
}

function runtimeStamp(siteId: string, tree: SiteTree) {
  return `${treeContentHash(siteId, tree)}:${BUNDLE_REV}`;
}

async function materializeBundleDir(siteId: string, tree: SiteTree): Promise<string> {
  const dir = getTreeDir(siteId, tree);
  const key = treeKey(siteId, tree);
  let gen = importGeneration.get(key) ?? 0;
  const bundleRoot = join(dir, ".bundle");
  const stamp = runtimeStamp(siteId, tree);

  const dirFor = (g: number) => join(bundleRoot, String(g));
  const stampPath = (g: number) => join(dirFor(g), ".stamp");
  const appPath = (g: number) => join(dirFor(g), "app.js");

  const stampFile = Bun.file(stampPath(gen));
  const appFile = Bun.file(appPath(gen));
  if ((await stampFile.exists()) && (await stampFile.text()) === stamp && (await appFile.exists())) {
    return dirFor(gen);
  }

  if ((await Bun.file(join(dirFor(gen), "app.tsx")).exists()) || (await appFile.exists())) {
    gen += 1;
    importGeneration.set(key, gen);
  }

  const outDir = dirFor(gen);

  for (const file of SITE_RUNTIME_FILES) {
    const content = readSourceFile(siteId, tree, file);
    if (!content.trim()) throw new BadRequestException(`Missing ${file} in ${tree}`);
    if (isOmittedSource(content)) throw new BadRequestException(`${file} ${OMITTED_WRITE_MESSAGE}`);
    await Bun.write(join(outDir, file), rewriteSandboxTs(content));
  }

  const css = readSourceFile(siteId, tree, "styles.css");
  await Bun.write(join(outDir, "styles.css"), isOmittedSource(css) ? "" : css);
  await Bun.write(join(outDir, "site-api.js"), PLATFORM_SITE_API_SOURCE);
  await Bun.write(join(outDir, "entry.tsx"), PLATFORM_ENTRY_SOURCE);
  await Bun.write(join(outDir, "tsconfig.json"), SANDBOX_TSCONFIG);

  return outDir;
}

function formatBuildLogs(logs: unknown[] | undefined): string {
  if (!logs?.length) return "Bundle failed (no compiler logs)";
  return logs
    .map((log) => {
      if (typeof log === "string") return log;
      if (log && typeof log === "object") {
        const rec = log as { message?: unknown };
        if (typeof rec.message === "string" && rec.message.trim()) return rec.message;
        try {
          return JSON.stringify(log);
        } catch {
          return String(log);
        }
      }
      return String(log);
    })
    .filter(Boolean)
    .join("\n");
}

export type SiteBundleResult = {
  dir: string;
  appJs: string;
  css: string;
  cached: boolean;
};

/**
 * Single-flight per (siteId, tree) — the live iframe HTML request and its two asset
 * requests (app.js, styles.css) all hit this concurrently after every edit, plus the
 * agent's own check_site call. Without dedup, concurrent callers race on the same
 * on-disk generation dir (partial writes mid-Bun.build) and cause flaky "bundle failed"
 * errors that are pure races, not real code problems.
 */
const buildLocks = new Map<string, Promise<SiteBundleResult>>();

export function buildSiteBundle(siteId: string, tree: SiteTree): Promise<SiteBundleResult> {
  const key = treeKey(siteId, tree);
  const inFlight = buildLocks.get(key);
  if (inFlight) return inFlight;

  const run = buildSiteBundleUnlocked(siteId, tree).finally(() => {
    buildLocks.delete(key);
  });
  buildLocks.set(key, run);
  return run;
}

async function buildSiteBundleUnlocked(siteId: string, tree: SiteTree): Promise<SiteBundleResult> {
  const key = treeKey(siteId, tree);
  const genBefore = importGeneration.get(key) ?? 0;
  const outDir = await materializeBundleDir(siteId, tree);
  const appJsPath = join(outDir, "app.js");
  const stamp = runtimeStamp(siteId, tree);
  const stampPath = join(outDir, ".stamp");
  const appJsFile = Bun.file(appJsPath);
  const stampFile = Bun.file(stampPath);

  if ((await appJsFile.exists()) && (await stampFile.exists()) && (await stampFile.text()) === stamp) {
    return {
      dir: outDir,
      appJs: await appJsFile.text(),
      css: await Bun.file(join(outDir, "styles.css")).text(),
      cached: true,
    };
  }

  const entry = join(outDir, "entry.tsx");
  const treeDir = getTreeDir(siteId, tree);
  let result: Awaited<ReturnType<typeof Bun.build>>;
  try {
    result = await Bun.build({
      entrypoints: [entry],
      outdir: outDir,
      root: treeDir,
      tsconfig: join(outDir, "tsconfig.json"),
      target: "browser",
      format: "esm",
      minify: true,
      sourcemap: "none",
      naming: "[name].[ext]",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BadRequestException(`Site bundle failed: ${message.slice(0, 2000)}`);
  }

  if (!result.success) {
    const msg = formatBuildLogs(result.logs);
    throw new BadRequestException(`Site bundle failed: ${msg.slice(0, 2000)}`);
  }

  // Prefer entry.js / entry-*.js output → normalize to app.js
  if (!(await Bun.file(appJsPath).exists())) {
    const built = result.outputs.find((o) => o.path.endsWith(".js") && !o.path.includes("chunk"));
    if (!built) {
      const names = result.outputs.map((o) => o.path).join(", ");
      throw new BadRequestException(`Site bundle produced no JS output (got: ${names || "none"})`);
    }
    await Bun.write(appJsPath, await built.text());
  }

  // If Bun named the file entry.js, copy to app.js
  const entryJs = join(outDir, "entry.js");
  if (!(await Bun.file(appJsPath).exists()) && (await Bun.file(entryJs).exists())) {
    await Bun.write(appJsPath, Bun.file(entryJs));
  }
  if (!(await Bun.file(appJsPath).exists())) {
    const built = result.outputs.find((o) => o.path.endsWith(".js"));
    if (built) await Bun.write(appJsPath, await built.text());
  }
  if (!(await Bun.file(appJsPath).exists())) throw new BadRequestException("Site bundle produced no app.js");

  const css = await collectBuiltCss(result, outDir);
  await Bun.write(join(outDir, "styles.css"), css);

  await Bun.write(stampPath, stamp);
  // Drop older gens (keep current)
  const bundleRoot = join(getTreeDir(siteId, tree), ".bundle");
  try {
    for (const name of readdirSync(bundleRoot)) {
      if (name === String(importGeneration.get(key) ?? genBefore)) continue;
      if (!/^\d+$/.test(name)) continue;
      rmSync(join(bundleRoot, name), { recursive: true, force: true });
    }
  } catch {
    /* ignore */
  }

  return {
    dir: outDir,
    appJs: await Bun.file(appJsPath).text(),
    css: await Bun.file(join(outDir, "styles.css")).text(),
    cached: false,
  };
}

async function collectBuiltCss(result: { outputs: Array<{ path: string; text(): Promise<string> }> }, outDir: string): Promise<string> {
  const fromBuild: string[] = [];
  for (const output of result.outputs) {
    if (!output.path.endsWith(".css") || output.path.endsWith(".css.map")) continue;
    fromBuild.push(await output.text());
  }
  if (fromBuild.length > 0) return fromBuild.join("\n");

  for (const name of ["entry.css", "app.css", "styles.css"]) {
    const file = Bun.file(join(outDir, name));
    if (await file.exists()) {
      const text = await file.text();
      if (text.trim()) return text;
    }
  }
  return "";
}

function siteOgHead(origin: string | undefined, slug: string, title: string): string {
  if (!origin) return "";
  const base = origin.replace(/\/$/, "");
  return ogMetaTags({
    title: `${title} · Nonla Agents`,
    description: `Published site on Nonla Agents · /public/sites/${slug}`,
    pageUrl: `${base}/public/sites/${encodeURIComponent(slug)}`,
    imageUrl: `${base}/api/og/sites/${encodeURIComponent(slug)}.png`,
  });
}

export function buildSiteShellHtml(opts: {
  title: string;
  apiBase: string;
  slug: string;
  assetBase: string;
  origin?: string;
}): string {
  const cssHref = `${opts.assetBase}/styles.css`;
  const jsHref = `${opts.assetBase}/app.js`;
  const og = siteOgHead(opts.origin, opts.slug, opts.title);

  return compactHtml(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="ra-site-api" content="${opts.apiBase}"/><meta name="ra-site-slug" content="${opts.slug}"/><title>${escapeHtml(opts.title)}</title>${og}<link rel="stylesheet" href="${cssHref}"/></head><body><div id="root"></div><script type="module" src="${jsHref}"></script></body></html>`,
  );
}

/** Escape JSON so it is safe inside a HTML <script> tag. */
export function serializeJsonForHtml(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Drop pretty whitespace from served HTML (keep script/json payloads intact). */
function compactHtml(html: string): string {
  return html.replace(/>\s+</g, "><").trim();
}

export function buildSiteUnlockHtml(opts: { title: string; slug: string; error?: string; origin?: string }) {
  const err = opts.error ? `<div class="error" role="alert"><p>${escapeHtml(opts.error)}</p></div>` : "";
  const og = siteOgHead(opts.origin, opts.slug, opts.title);
  // Meadow wallpaper (same as dashboard DesktopStage) + NonlaUI light card
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
  ${og}
  <style>
    :root{
      color-scheme:light;
      --nonla-bg:#fffcf1;--nonla-fg:#1f1f1e;--nonla-brand:#f18d00;--nonla-solid-fg:#fff;
      --nonla-fg-tertiary:color-mix(in oklab,var(--nonla-fg) 64%,var(--nonla-bg));
      --nonla-fg-quaternary:color-mix(in oklab,var(--nonla-fg) 50%,var(--nonla-bg));
      --nonla-surface:#fff;--nonla-danger:#c0392b;
      --nonla-border:color-mix(in oklab,var(--nonla-fg) 7%,var(--nonla-bg));
      --nonla-input:color-mix(in oklab,var(--nonla-fg) 12%,var(--nonla-bg));
      --nonla-radius:8px;--nonla-height-lg:40px;
      --border-subtle:color-mix(in srgb,var(--nonla-border) 65%,transparent);
      --ring:color-mix(in oklab,var(--nonla-brand) 55%,transparent);
    }
    *{box-sizing:border-box}
    body{margin:0;min-width:320px;background:var(--nonla-bg);color:var(--nonla-fg);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .wrap{position:relative;display:flex;min-height:100vh;align-items:center;justify-content:center;overflow:hidden;padding:20px}
    .wallpaper{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;pointer-events:none;user-select:none}
    .veil{pointer-events:none;position:absolute;inset:0;background:color-mix(in srgb,var(--nonla-bg) 28%,transparent)}
    .shell{position:relative;z-index:1;width:100%;max-width:24rem}
    .card{overflow:hidden;border:1px solid var(--nonla-border);border-radius:var(--nonla-radius);background:var(--nonla-surface);box-shadow:0 16px 48px color-mix(in srgb,var(--nonla-fg) 14%,transparent),0 0 0 1px color-mix(in srgb,var(--nonla-fg) 4%,transparent)}
    .chrome{display:flex;align-items:center;gap:8px;height:32px;padding:0 12px;border-bottom:1px solid color-mix(in srgb,var(--nonla-border) 65%,transparent);background:var(--nonla-bg)}
    .chrome-title{font-size:13px;font-weight:600;color:var(--nonla-fg)}
    .hero{display:flex;flex-direction:column;align-items:center;padding:1.75rem 1.5rem 1.25rem;text-align:center}
    .icon-wrap{position:relative;margin-bottom:1rem}
    .icon-glow{pointer-events:none;position:absolute;top:50%;left:50%;width:6.5rem;height:6.5rem;transform:translate(-50%,-50%);border-radius:999px;background:radial-gradient(circle,color-mix(in oklab,var(--nonla-brand) 26%,transparent) 0%,transparent 70%)}
    .icon{position:relative;display:flex;width:3.5rem;height:3.5rem;align-items:center;justify-content:center;overflow:hidden;border-radius:999px;border:1px solid color-mix(in oklab,var(--nonla-brand) 28%,transparent);background:var(--nonla-surface);color:var(--nonla-brand)}
    h1{overflow:hidden;margin:0;max-width:100%;color:var(--nonla-fg);font-size:1.25rem;font-weight:600;line-height:1.75rem;letter-spacing:-0.02em;text-overflow:ellipsis;white-space:nowrap}
    .description{margin:.375rem 0 0;max-width:22rem;color:var(--nonla-fg-tertiary);font-size:.875rem;line-height:1.25rem}
    form{padding:1.25rem 1.5rem 1.5rem;border-top:1px solid var(--border-subtle)}
    label{display:block;margin-bottom:.375rem;color:var(--nonla-fg);font-size:.875rem;font-weight:500}
    .field{margin-bottom:1rem}
    .input-wrap{position:relative;display:block}
    .input-lock{position:absolute;top:50%;left:12px;width:16px;height:16px;transform:translateY(-50%);color:var(--nonla-fg-quaternary);pointer-events:none}
    input{display:block;width:100%;height:var(--nonla-height-lg);border:1px solid var(--nonla-input);border-radius:var(--nonla-radius);background:var(--nonla-surface);color:var(--nonla-fg);padding:0 12px 0 38px;font:inherit;font-size:.875rem;outline:none;transition:border-color .15s,box-shadow .15s}
    input::placeholder{color:var(--nonla-fg-tertiary)}
    /* Class + :focus — :focus alone skips when the tab/window lacks system focus */
    input.is-focused,input:focus,input:focus-visible{border-color:var(--nonla-brand);box-shadow:0 0 0 3px color-mix(in oklab,var(--nonla-brand) 28%,transparent)}
    .error{margin:0 0 1rem;padding:.5rem .75rem;border:1px solid color-mix(in oklab,var(--nonla-danger) 20%,transparent);border-radius:6px;background:color-mix(in oklab,var(--nonla-danger) 10%,transparent)}
    .error p{margin:0;color:var(--nonla-danger);font-size:.75rem;font-weight:500;line-height:1rem}
    button{display:inline-flex;width:100%;height:var(--nonla-height-lg);align-items:center;justify-content:center;border:0;border-radius:var(--nonla-radius);background:var(--nonla-brand);color:var(--nonla-solid-fg);font:inherit;font-size:.875rem;font-weight:500;cursor:pointer;transition:filter .15s,transform .1s}
    button:hover{filter:brightness(1.06)}
    button:active{transform:scale(.99);filter:brightness(.96)}
    button:focus-visible{outline:2px solid var(--ring);outline-offset:3px}
    button[disabled]{opacity:.65;cursor:wait}
    @media(max-width:480px){.wrap{padding:16px}}
  </style>
</head>
<body>
  <main class="wrap">
    <img class="wallpaper" src="/bg.jpg" alt="" draggable="false" />
    <div class="veil" aria-hidden="true"></div>
    <section class="shell" aria-labelledby="site-title">
      <div class="card">
        <div class="chrome" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="color:var(--nonla-brand)"><rect x="4" y="10" width="16" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>
          <span class="chrome-title">Unlock</span>
        </div>
        <div class="hero">
          <div class="icon-wrap">
            <div class="icon-glow" aria-hidden="true"></div>
            <div class="icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="16" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path><path d="M12 14v2"></path></svg>
            </div>
          </div>
          <h1 id="site-title">${escapeHtml(opts.title)}</h1>
          <p class="description">Enter password to continue</p>
        </div>
        <form id="f">
          <div class="field">
            <label for="p">Password</label>
            <span class="input-wrap"><svg class="input-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg><input id="p" name="password" type="password" placeholder="Enter the password" autocomplete="current-password" autofocus required /></span>
          </div>
          ${err}
          <button type="submit" id="btn">Unlock</button>
        </form>
      </div>
    </section>
  </main>
  <script>
    (async function () {
      var slug = ${JSON.stringify(opts.slug)};
      var params = new URLSearchParams(location.search);
      var key = "site_public_auth_" + slug;
      var saved = localStorage.getItem(key);
      var form = document.getElementById("f");
      var btn = document.getElementById("btn");
      var input = document.getElementById("p");
      function focusPassword() {
        if (!input) return;
        input.classList.add("is-focused");
        try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
      }
      input.addEventListener("focus", function () { input.classList.add("is-focused"); });
      input.addEventListener("blur", function () { input.classList.remove("is-focused"); });
      // Focus immediately — don't wait on token verify. Class keeps ring visible
      // even when the browser tab lacks system focus (:focus won't match).
      focusPassword();
      requestAnimationFrame(focusPassword);
      setTimeout(focusPassword, 0);
      setTimeout(focusPassword, 50);
      window.addEventListener("pageshow", focusPassword);
      window.addEventListener("focus", focusPassword);
      // Legacy ?site_token= URLs — clear storage and strip query (cookie auth only).
      if (params.get("site_token")) {
        localStorage.removeItem(key);
        if (history.replaceState) {
          history.replaceState(null, "", location.pathname + (params.get("e") ? "?e=1" : ""));
        }
      } else if (saved && !params.get("e")) {
        try {
          var tokenRes = await fetch("/api/public/sites/" + encodeURIComponent(slug) + "/verify-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: saved }),
            credentials: "same-origin",
          });
          var tokenData = await tokenRes.json();
          if (tokenData.valid) {
            location.replace(location.pathname);
            return;
          }
        } catch (_) {}
        localStorage.removeItem(key);
      }
      focusPassword();
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        btn.disabled = true;
        btn.textContent = "Unlocking…";
        try {
          var password = input.value;
          var res = await fetch("/api/public/sites/" + encodeURIComponent(slug) + "/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: password }),
            credentials: "same-origin",
          });
          var data = await res.json();
          if (!res.ok || !data.valid) {
            location.search = "?e=1";
            return;
          }
          if (data.token) {
            localStorage.setItem(key, data.token);
          }
          location.href = location.pathname;
        } catch (_) {
          btn.disabled = false;
          btn.textContent = "Unlock";
          focusPassword();
        }
      });
    })();
  </script>
</body>
</html>`;
}
