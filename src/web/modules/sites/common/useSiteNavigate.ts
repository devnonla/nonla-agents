import { type RefObject, useEffect } from "react";
import { isAllowedSiteFormMessageOrigin, isRaSiteNavigateMessage, resolveSiteNavigate } from "./siteFormSubmit";

type UseSiteNavigateOptions = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  enabled?: boolean;
  publicPath: string;
  onSoftNavigate: (query: Record<string, string>) => void | Promise<void>;
};

export function useSiteNavigate({ iframeRef, enabled = true, publicPath, onSoftNavigate }: UseSiteNavigateOptions) {
  useEffect(() => {
    if (!enabled || !publicPath) return;

    const onMessage = (event: MessageEvent) => {
      if (!isAllowedSiteFormMessageOrigin(event.origin)) return;
      if (!isRaSiteNavigateMessage(event.data)) return;
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;

      const decision = resolveSiteNavigate(event.data.href, publicPath, window.location.origin);
      if (decision.kind === "soft") {
        void onSoftNavigate(decision.query);
        return;
      }
      if (decision.kind === "external") {
        window.open(decision.url, "_blank", "noopener,noreferrer");
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [enabled, iframeRef, publicPath, onSoftNavigate]);
}
