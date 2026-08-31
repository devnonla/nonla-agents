/**
 * After a deploy, hashed Vite chunks are replaced. An open tab can still hold
 * the old shell and fail lazy imports, or keep running mismatched JS/CSS.
 * Reload once when the server buildId drifts or a preload fails.
 */

const RELOAD_FLAG = "nonla-agents:stale-reload";

function reloadOnce(reason: string): void {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG) === reason) return;
    sessionStorage.setItem(RELOAD_FLAG, reason);
  } catch {
    /* private mode / blocked storage — still reload */
  }
  window.location.reload();
}

function clearReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignore */
  }
}

async function checkServerBuildId(): Promise<void> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { buildId?: string };
    if (!data.buildId) return;
    if (data.buildId === __APP_BUILD_ID__) {
      clearReloadFlag();
      return;
    }
    reloadOnce(`build:${data.buildId}`);
  } catch {
    /* offline / starting up */
  }
}

/** Call once from main.tsx. No-op in Vite dev (HMR; no deploy fingerprint). */
export function initReloadOnStaleDeploy(): void {
  if (import.meta.env.DEV) return;

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadOnce("preload");
  });

  void checkServerBuildId();
  window.addEventListener("focus", () => {
    void checkServerBuildId();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkServerBuildId();
  });
}
