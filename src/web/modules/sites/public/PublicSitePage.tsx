import { message } from "@nonla-agents/ui";
import { LockIcon } from "@solar-icons/react/dynamic/lock";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { PublicUnlockScreen } from "src/components/PublicUnlockScreen";
import { injectSiteFrameBridge, isSrcDocFrameNavigatedAway } from "../common/injectSiteFrameBridge";
import type { SiteActionResult } from "../common/siteFormSubmit";
import { useSiteFormSubmit } from "../common/useSiteFormSubmit";
import { useSiteNavigate } from "../common/useSiteNavigate";

type PublicSitePayload = {
  html?: string;
  message?: string;
  locked?: boolean;
  requiresPassword?: boolean;
  site?: { id: string; name: string; slug: string };
};

function tokenKey(slug: string) {
  return `site_public_auth_${slug}`;
}

function queryFromSearch(search: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(search).entries());
}

export default function PublicSitePage() {
  const { slug } = useParams<{ slug: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [siteName, setSiteName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [frameEpoch, setFrameEpoch] = useState(0);
  const [pageQuery, setPageQuery] = useState<Record<string, string>>(() => (typeof window !== "undefined" ? queryFromSearch(window.location.search) : {}));
  const pageQueryRef = useRef(pageQuery);
  pageQueryRef.current = pageQuery;

  const fetchSite = useCallback(
    async (token?: string | null, query?: Record<string, string>) => {
      if (!slug) return;
      const q = query ?? pageQueryRef.current;
      const headers: Record<string, string> = {};
      if (token) headers["X-Site-Access-Token"] = token;
      const qs = new URLSearchParams(q).toString();
      const res = await fetch(`/api/public/sites/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`, {
        headers,
        cache: "no-store",
      });
      const data = (await res.json()) as PublicSitePayload;
      if (!res.ok) {
        setError(data.message ?? "Site not found");
        setHtml(null);
        return;
      }
      setSiteName(data.site?.name ?? slug);
      setRequiresPassword(!!data.requiresPassword);
      if (data.locked) {
        setIsAuthenticated(false);
        setHtml(null);
        return;
      }
      setIsAuthenticated(true);
      setHtml(data.html ?? "");
      setError(null);
    },
    [slug],
  );

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const saved = localStorage.getItem(tokenKey(slug));
        if (saved) {
          const tokenRes = await fetch(`/api/public/sites/${encodeURIComponent(slug)}/verify-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: saved }),
          });
          const tokenData = (await tokenRes.json()) as { valid?: boolean };
          if (tokenData.valid) {
            if (!cancelled) setAccessToken(saved);
            await fetchSite(saved);
            return;
          }
          localStorage.removeItem(tokenKey(slug));
        }
        await fetchSite(null);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, fetchSite]);

  useEffect(() => {
    if (siteName) document.title = siteName;
  }, [siteName]);

  const onAction = useCallback(
    async (formData: FormData) => {
      if (!slug) throw new Error("Missing site");
      const headers: Record<string, string> = {};
      if (accessToken) headers["X-Site-Access-Token"] = accessToken;
      const res = await fetch(`/api/public/sites/${encodeURIComponent(slug)}/action`, {
        method: "POST",
        headers,
        body: formData,
      });
      const data = (await res.json()) as { result?: SiteActionResult; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Action failed");
      return { result: data.result };
    },
    [slug, accessToken],
  );

  const onSoftReload = useCallback(async () => {
    await fetchSite(accessToken);
    setFrameEpoch((n) => n + 1);
  }, [fetchSite, accessToken]);

  const onResult = useCallback((result: SiteActionResult) => {
    if (!result.message) return;
    if (result.ok === false) message.error(result.message);
    else message.success(result.message);
  }, []);

  const { submitting } = useSiteFormSubmit({
    iframeRef,
    enabled: !!slug && html != null && isAuthenticated,
    onAction,
    onSoftReload,
    onResult,
    onError: (msg) => message.error(msg),
  });

  const onSoftNavigate = useCallback(
    async (query: Record<string, string>) => {
      setPageQuery(query);
      const qs = new URLSearchParams(query).toString();
      const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
      window.history.replaceState(null, "", next);
      await fetchSite(accessToken, query);
      setFrameEpoch((n) => n + 1);
    },
    [fetchSite, accessToken],
  );

  useSiteNavigate({
    iframeRef,
    enabled: !!slug && html != null && isAuthenticated,
    publicPath: slug ? `/public/sites/${slug}` : "",
    onSoftNavigate,
  });

  const verifyPassword = async (password: string) => {
    if (!slug || !password) return;
    setVerifying(true);
    setAuthError("");
    try {
      const res = await fetch(`/api/public/sites/${encodeURIComponent(slug)}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { valid?: boolean; token?: string; message?: string };
      if (!res.ok || !data.valid) {
        setAuthError(data.message ?? "Incorrect password");
        return;
      }
      if (data.token) {
        localStorage.setItem(tokenKey(slug), data.token);
        setAccessToken(data.token);
        await fetchSite(data.token);
      } else {
        setAccessToken(null);
        await fetchSite(null);
      }
    } catch {
      setAuthError("Unable to verify password");
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center p-6 font-sans text-sm text-neutral-500">Loading…</div>;
  }

  if (error) {
    return <div className="flex min-h-screen items-center justify-center p-6 font-sans text-sm text-red-600">{error}</div>;
  }

  if (requiresPassword && !isAuthenticated) {
    return <PublicUnlockScreen icon={<LockIcon size={32} className="text-brand-soft" />} title={siteName || "Protected site"} description="Enter password to continue" error={authError} verifying={verifying} onSubmit={(password) => void verifyPassword(password)} />;
  }

  if (html == null) {
    return <div className="flex min-h-screen items-center justify-center p-6 font-sans text-sm text-neutral-500">Loading…</div>;
  }

  return (
    <div className="relative h-screen w-full">
      <iframe
        key={frameEpoch}
        ref={iframeRef}
        title={siteName || slug || "site"}
        className="h-screen w-full border-0 bg-white"
        srcDoc={injectSiteFrameBridge(html, slug ? `/public/sites/${slug}` : "")}
        onLoad={() => {
          if (isSrcDocFrameNavigatedAway(iframeRef.current)) {
            setFrameEpoch((n) => n + 1);
          }
        }}
      />
      {submitting ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40 text-sm text-muted-foreground backdrop-blur-[1px]">Submitting…</div> : null}
    </div>
  );
}
