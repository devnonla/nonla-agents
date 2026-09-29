/** Get or create a persistent device fingerprint (survives across sessions). */
export function getFingerprint(): string {
  const key = "__device_fp";
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem(key, fp);
  }
  return fp;
}

/** Internal tools that should not be shown to end users in public chat. */
export const HIDDEN_TOOL_NAMES = new Set<string>();
