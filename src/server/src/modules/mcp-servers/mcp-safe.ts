/**
 * Redact MCP server secrets for API / WebSocket responses.
 */

const MASK = "••••";

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length > 8) return `${value.slice(0, 4)}${MASK}${value.slice(-4)}`;
  return "••••••••";
}

export function isMaskedSecret(value: string): boolean {
  return value.includes(MASK);
}

export function maskHeaders(headers: Record<string, string> | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    result[key] = maskSecret(value);
  }
  return result;
}

export function toSafeMcpServer<T extends { headers?: Record<string, string> | null }>(server: T): T {
  return { ...server, headers: maskHeaders(server.headers) };
}

/** Merge incoming headers; keep existing values when the client sends a masked placeholder. */
export function mergeHeaders(existing: Record<string, string>, incoming: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (isMaskedSecret(value) && existing[key] !== undefined) {
      merged[key] = existing[key];
    } else {
      merged[key] = value;
    }
  }
  return merged;
}
