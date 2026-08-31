/**
 * MCP URL safety checks (SSRF prevention).
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.google", "instance-data"]);
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

/** Same contract as Node `net.isIP`: 4, 6, or 0. */
function ipVersion(ip: string): 0 | 4 | 6 {
  if (IPV4_RE.test(ip)) return 4;
  try {
    const parsed = new URL(`http://[${ip}]`);
    if (parsed.hostname) return 6;
  } catch {
    /* not IPv6 */
  }
  return 0;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const version = ipVersion(ip);
  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80")) return true;
    if (normalized.startsWith("::ffff:")) {
      const v4 = normalized.slice(7);
      if (ipVersion(v4) === 4) return isPrivateOrReservedIp(v4);
    }
    return false;
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  return false;
}

/** Validate MCP URL scheme/host and ensure it does not resolve to private addresses. */
export async function assertSafeMcpUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid MCP server URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("MCP server URL must use http or https");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(hostname)) {
    throw new Error("MCP server URL must not target private or local hosts");
  }

  if (ipVersion(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error("MCP server URL must not target private or local addresses");
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await Bun.dns.lookup(hostname);
  } catch {
    throw new Error(`Unable to resolve MCP server host: ${hostname}`);
  }

  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error("MCP server URL must not resolve to private or local addresses");
    }
  }
}
