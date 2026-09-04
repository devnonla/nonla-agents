/**
 * Public Streamable HTTP MCP endpoint: POST /mcp/:id
 *
 * Stateless JSON-RPC 2.0. Auth: Authorization Bearer ra_mcp_… matching that server.
 */

import { Hono } from "hono";
import rootPkg from "../../../../../package.json" with { type: "json" };
import { ForbiddenException, NotFoundException, UnauthorizedException } from "../../common/exceptions/http.exception.js";
import { getDataDir } from "../../common/utils/data-dir.js";
import { executeTool } from "../tools/common/tool-runner.js";
import { authenticateMyMcpServer, getAssignedToolForCall, listLiveMcpTools } from "./my-mcp-servers.service.js";

const APP_VERSION = rootPkg.version;
const MCP_TOOL_TIMEOUT_MS = 60_000;
const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);
const DEFAULT_PROTOCOL_VERSION = "2025-03-26";

type JsonRpcId = string | number | null;
type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

function isNotification(req: JsonRpcRequest): boolean {
  return req.id === undefined;
}

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function textResult(text: string, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

function pickProtocolVersion(requested: unknown): string {
  if (typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.has(requested)) return requested;
  return DEFAULT_PROTOCOL_VERSION;
}

function readBearer(header: string | undefined): string | null {
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

async function handleMethod(serverId: string, serverName: string, req: JsonRpcRequest): Promise<unknown> {
  const method = req.method ?? "";
  const params = req.params ?? {};

  switch (method) {
    case "initialize":
      return {
        protocolVersion: pickProtocolVersion(params.protocolVersion),
        capabilities: { tools: {} },
        serverInfo: { name: serverName, version: APP_VERSION },
      };
    case "ping":
      return {};
    case "tools/list": {
      const tools = (await listLiveMcpTools(serverId)).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      return { tools };
    }
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      if (!name) return textResult("Tool name is required", true);
      const tool = await getAssignedToolForCall(serverId, name);
      if (!tool) return textResult(`Tool not found: ${name}`, true);
      if (!tool.isActive) return textResult(`Tool is inactive: ${name}`, true);
      const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
      const raw = await executeTool(tool.id, tool.codeContent, JSON.stringify(args), getDataDir(), MCP_TOOL_TIMEOUT_MS);
      try {
        const parsed = JSON.parse(raw) as { ok?: boolean; result?: unknown; error?: string; console?: string };
        const isError = parsed.ok !== true;
        return textResult(JSON.stringify(parsed), isError);
      } catch {
        return textResult(raw, true);
      }
    }
    case "resources/list":
      return { resources: [] };
    case "prompts/list":
      return { prompts: [] };
    default:
      return undefined;
  }
}

async function handleRpc(serverId: string, serverName: string, req: JsonRpcRequest): Promise<Response> {
  if (req.method === "notifications/initialized" || (isNotification(req) && req.method?.startsWith("notifications/"))) {
    return new Response(null, { status: 202 });
  }

  const id = req.id ?? null;
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return Response.json(rpcError(id, -32600, "Invalid Request"));
  }

  try {
    const result = await handleMethod(serverId, serverName, req);
    if (result === undefined) {
      return Response.json(rpcError(id, -32601, `Method not found: ${req.method}`));
    }
    return Response.json(rpcResult(id, result));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(rpcError(id, -32603, message));
  }
}

const app = new Hono();

function methodNotAllowed() {
  return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS" } });
}

app.get("/:id", () => methodNotAllowed());
app.delete("/:id", () => methodNotAllowed());

app.post("/:id", async (c) => {
  const id = c.req.param("id");
  const token = readBearer(c.req.header("authorization"));
  if (!token) throw new UnauthorizedException("Authentication required");

  const auth = await authenticateMyMcpServer(id, token);
  if (auth === "missing") throw new NotFoundException("MCP server not found");
  if (auth === "unauthorized") throw new UnauthorizedException("Invalid token");
  if (auth === "inactive") throw new ForbiddenException("MCP server is inactive");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  if (Array.isArray(body)) {
    const responses: unknown[] = [];
    for (const item of body) {
      const req = (item ?? {}) as JsonRpcRequest;
      if (req.method === "notifications/initialized" || (isNotification(req) && req.method?.startsWith("notifications/"))) {
        continue;
      }
      const res = await handleRpc(auth.id, auth.name, req);
      if (res.status === 202) continue;
      responses.push(await res.json());
    }
    return Response.json(responses);
  }

  return await handleRpc(auth.id, auth.name, (body ?? {}) as JsonRpcRequest);
});

export default app;
