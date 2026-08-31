/**
 * mcp-client.ts — MCP SDK client wrapper.
 *
 * Manages connections to remote MCP servers (SSE / Streamable HTTP).
 * Each mcp_server row gets its own client (keyed by serverId).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { assertSafeMcpUrl } from "./mcp-url.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: object;
}

// ─── Connection Cache (per server id) ─────────────────────────────────────────

interface CachedConnection {
  client: Client;
  createdAt: number;
}

const connectionCache = new Map<string, CachedConnection>();
const CONNECTION_TTL_MS = 5 * 60 * 1000; // 5 minutes

function clearStaleConnections() {
  const now = Date.now();
  for (const [key, conn] of connectionCache) {
    if (now - conn.createdAt > CONNECTION_TTL_MS) {
      conn.client.close().catch(() => {});
      connectionCache.delete(key);
    }
  }
}

setInterval(clearStaleConnections, 60_000);

async function closeCached(serverId: string): Promise<void> {
  const cached = connectionCache.get(serverId);
  if (!cached) return;
  connectionCache.delete(serverId);
  try {
    await cached.client.close();
  } catch {
    // ignore close errors
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Legacy SSE fallback only when the server likely speaks the old transport — not auth failures. */
function shouldFallbackToSse(err: unknown): boolean {
  const msg = errMessage(err).toLowerCase();
  if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden")) {
    return false;
  }
  // MCP backwards-compat: 400 / 404 / 405 on Streamable HTTP → try legacy SSE
  if (/\b(400|404|405)\b/.test(msg)) return true;
  if (msg.includes("method not allowed") || msg.includes("not found") || msg.includes("bad request")) return true;
  // Network / parse failures sometimes mean wrong transport
  if (msg.includes("fetch failed") || msg.includes("econnrefused") || msg.includes("enotfound")) return false;
  return false;
}

/**
 * Get or create an MCP client for a specific server row.
 * Tries Streamable HTTP first; falls back to legacy SSE only when appropriate.
 */
async function getClient(serverId: string, url: string, headers: Record<string, string> = {}): Promise<Client> {
  await assertSafeMcpUrl(url);

  const cached = connectionCache.get(serverId);
  if (cached && Date.now() - cached.createdAt < CONNECTION_TTL_MS) {
    return cached.client;
  }

  if (cached) {
    await closeCached(serverId);
  }

  let streamableErr: unknown;

  try {
    const client = new Client({ name: "nonla-agents", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers },
    });
    await client.connect(transport);
    connectionCache.set(serverId, { client, createdAt: Date.now() });
    return client;
  } catch (err) {
    streamableErr = err;
    if (!shouldFallbackToSse(err)) {
      throw new Error(`Failed to connect to MCP server at ${url}: ${errMessage(err)}`);
    }
  }

  try {
    const client = new Client({ name: "nonla-agents", version: "1.0.0" });
    const transport = new SSEClientTransport(new URL(url), {
      requestInit: { headers },
    });
    await client.connect(transport);
    connectionCache.set(serverId, { client, createdAt: Date.now() });
    return client;
  } catch (sseErr) {
    throw new Error(`Failed to connect to MCP server at ${url}: ${errMessage(streamableErr)} (SSE fallback: ${errMessage(sseErr)})`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function listMcpTools(serverId: string, url: string, headers: Record<string, string> = {}): Promise<McpToolDef[]> {
  const client = await getClient(serverId, url, headers);

  const result = await client.listTools();
  return (result.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as object,
  }));
}

/** Default wall-clock for a single MCP tool invocation (keeps agent streams from hanging forever). */
export const MCP_TOOL_TIMEOUT_MS = 60_000;

export async function callMcpTool(serverId: string, url: string, headers: Record<string, string>, toolName: string, args: Record<string, unknown> = {}, options?: { timeoutMs?: number; abortSignal?: AbortSignal }): Promise<unknown> {
  const timeoutMs = options?.timeoutMs ?? MCP_TOOL_TIMEOUT_MS;
  const client = await getClient(serverId, url, headers);

  const callPromise = client.callTool({ name: toolName, arguments: args });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`MCP tool "${toolName}" timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });

  const onAbort = () => {
    /* race settle via abortPromise */
  };
  const abortPromise =
    options?.abortSignal &&
    new Promise<never>((_, reject) => {
      if (options.abortSignal!.aborted) {
        reject(new Error(`MCP tool "${toolName}" aborted`));
        return;
      }
      options.abortSignal!.addEventListener(
        "abort",
        () => {
          onAbort();
          reject(new Error(`MCP tool "${toolName}" aborted`));
        },
        { once: true },
      );
    });

  try {
    const result = await Promise.race([callPromise, timeoutPromise, ...(abortPromise ? [abortPromise] : [])]);

    if (result && typeof result === "object" && "content" in result && Array.isArray((result as any).content)) {
      const texts = (result as any).content.filter((c: any) => c.type === "text").map((c: any) => c.text);
      if (texts.length === 1) {
        try {
          return JSON.parse(texts[0]);
        } catch {
          return texts[0];
        }
      }
      if (texts.length > 1) return texts.join("\n");
      return (result as any).content ?? result;
    }

    return (result as any)?.content ?? result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Disconnect and remove a cached connection for one server. */
export async function disconnectMcp(serverId: string): Promise<void> {
  await closeCached(serverId);
}
