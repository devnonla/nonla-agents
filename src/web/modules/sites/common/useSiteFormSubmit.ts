import { type RefObject, useEffect, useState } from "react";
import { type SiteActionResult, formDataFromEntries, isAllowedSiteFormMessageOrigin, isRaSiteFormSubmitMessage, postSiteFormBusy, shouldReloadAfterAction } from "./siteFormSubmit";

type UseSiteFormSubmitOptions = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  enabled?: boolean;
  onAction: (formData: FormData, meta: { path?: string }) => Promise<{ result?: SiteActionResult }>;
  onSoftReload?: () => Promise<void>;
  onResult?: (result: SiteActionResult) => void;
  onError?: (message: string) => void;
};

export function useSiteFormSubmit({ iframeRef, enabled = true, onAction, onSoftReload, onResult, onError }: UseSiteFormSubmitOptions) {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let busy = false;

    const setBusy = (next: boolean) => {
      busy = next;
      setSubmitting(next);
      postSiteFormBusy(iframeRef.current, next);
    };

    const onMessage = async (event: MessageEvent) => {
      if (!isAllowedSiteFormMessageOrigin(event.origin)) return;
      if (!isRaSiteFormSubmitMessage(event.data)) return;
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      if (busy) return;

      setBusy(true);
      try {
        const fd = formDataFromEntries(event.data.entries);
        const data = await onAction(fd, { path: event.data.path });
        const result = data.result ?? {};
        onResult?.(result);
        if (shouldReloadAfterAction(result) && onSoftReload) {
          await onSoftReload();
        }
      } catch (err: unknown) {
        onError?.(err instanceof Error ? err.message : "Action failed");
      } finally {
        setBusy(false);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [enabled, iframeRef, onAction, onSoftReload, onResult, onError]);

  return { submitting };
}
