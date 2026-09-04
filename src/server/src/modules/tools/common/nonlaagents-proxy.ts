import { eq } from "drizzle-orm";
import { agentConversations, getDb, users } from "../../../common/db/client.js";
import { qone } from "../../../common/db/query.js";
import { HttpException } from "../../../common/exceptions/http.exception.js";
import { getAgent } from "../../agents/agents.service.js";
import { runAgentConversation } from "../../agents/runtime/runtime.service.js";
import { createConversation, createMessage, updateConversationStatus } from "../../conversations/conversations.service.js";
import { deleteRowsByName, getProjectSchemaByRef, insertRowsByName, listProjects, queryRowsByName, resolveProject, updateRowByName } from "../../datatables/datatables.service.js";
import { deleteKvByKey, getKvByKey, listKvEntries, upsertKvByKey } from "../../kvstore/kvstore.service.js";
import { getSecretValueByKey, listSecrets } from "../../secrets/secrets.service.js";

type RpcBody = { ns?: string; action?: string; args?: Record<string, unknown> };

function ok(result: unknown) {
  return Response.json({ ok: true, result });
}

function fail(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

async function handleKv(action: string, args: Record<string, unknown>) {
  switch (action) {
    case "get": {
      const key = String(args.key ?? "")
        .trim()
        .toUpperCase();
      const entry = await getKvByKey(key);
      return ok(entry?.value ?? null);
    }
    case "set": {
      const key = String(args.key ?? "");
      const value = args.value;
      if (typeof value !== "string") throw new Error("value must be a string");
      return ok(await upsertKvByKey({ key, value }));
    }
    case "list": {
      const result = await listKvEntries({ limit: "1000" });
      return ok((result.items as { key: string; value: string }[]).map((e) => ({ key: e.key, value: e.value })));
    }
    case "delete": {
      const key = String(args.key ?? "")
        .trim()
        .toUpperCase();
      return ok(await deleteKvByKey(key));
    }
    default:
      throw new Error(`Unknown kv action: ${action}`);
  }
}

async function handleSecrets(action: string, args: Record<string, unknown>) {
  switch (action) {
    case "get": {
      const key = String(args.key ?? "")
        .trim()
        .toUpperCase();
      return ok(await getSecretValueByKey(key));
    }
    case "list": {
      const result = await listSecrets({ limit: "1000" });
      return ok((result.items as { key: string }[]).map((e) => e.key));
    }
    default:
      throw new Error(`Unknown secrets action: ${action}`);
  }
}

function formatProjects(projects: { id: string; name: string }[]) {
  if (projects.length === 0) return "(none)";
  return projects.map((p) => `${p.name} [id=${p.id}]`).join(", ");
}

async function handleDatatable(action: string, args: Record<string, unknown>) {
  switch (action) {
    case "list_projects":
      return ok((await listProjects()).map((p) => ({ id: p.id, name: p.name })));
    case "get_schema": {
      const projectRef = String(args.project ?? "").trim();
      const availableProjects = (await listProjects()).map((p) => ({ id: p.id, name: p.name }));
      if (!projectRef) {
        throw new Error(`'project' is required (id or name). Available projects: ${formatProjects(availableProjects)}`);
      }
      const project = await resolveProject(projectRef);
      if (!project) {
        throw new Error(`Project "${projectRef}" not found. Available projects: ${formatProjects(availableProjects)}`);
      }

      // Always full project schema (all tables + columns)
      const schema = await getProjectSchemaByRef(project.id);
      return ok({
        project: { id: schema.project.id, name: schema.project.name },
        tables: schema.tables.map((t) => ({
          id: t.id,
          name: t.name,
          columns: t.columns.map((c) => ({
            name: c.name,
            type: c.type,
            options: c.options,
            required: c.required,
          })),
        })),
      });
    }
    case "query":
      return ok(
        await queryRowsByName(String(args.project ?? ""), String(args.table ?? ""), {
          where: args.where as import("../../datatables/datatable-where.util.js").WhereFilter | undefined,
          order_by: args.order_by as { key: string; dir?: "asc" | "desc" }[] | undefined,
          limit: typeof args.limit === "number" ? args.limit : undefined,
          offset: typeof args.offset === "number" ? args.offset : undefined,
        }),
      );
    case "insert":
      return ok(await insertRowsByName(String(args.project ?? ""), String(args.table ?? ""), (args.rows as Record<string, unknown>[]) ?? []));
    case "update":
      return ok(await updateRowByName(String(args.project ?? ""), String(args.table ?? ""), String(args.row_id ?? ""), (args.data as Record<string, unknown>) ?? {}));
    case "delete":
      return ok(await deleteRowsByName(String(args.project ?? ""), String(args.table ?? ""), (args.row_ids as string[]) ?? []));
    default:
      throw new Error(`Unknown datatable action: ${action}`);
  }
}

async function resolveJobOwnerId(): Promise<string> {
  const admin = await qone(getDb().select({ id: users.id }).from(users).where(eq(users.role, "admin")));
  return admin?.id ?? "system";
}

async function handleAgents(action: string, args: Record<string, unknown>) {
  switch (action) {
    case "run": {
      const agentId = String(args.agentId ?? "").trim();
      const message = String(args.message ?? "");
      if (!agentId) throw new Error("agentId is required");
      if (!message.trim()) throw new Error("message is required");

      const agent = await getAgent(agentId);
      if (!agent) throw new Error(`Agent not found: ${agentId}`);

      const ownerId = await resolveJobOwnerId();
      const conv = await createConversation({
        agentId,
        title: `Job run · ${agent.name}`,
        trigger: "cron",
        ownerId,
      });
      const conversationId = conv.id!;
      await createMessage(conversationId, { agentId, role: "user", content: message, metadata: null });

      try {
        const result = await runAgentConversation({
          agentId,
          conversationId,
          message,
          ownerId,
        });

        if (result.cancelled) {
          throw new Error("Agent run cancelled");
        }
        if (result.failed && !result.text.trim()) {
          throw new Error("Agent run failed");
        }
        return ok(result.text ?? "");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const live = await qone(getDb().select().from(agentConversations).where(eq(agentConversations.id, conversationId)));
        if (live?.status === "running") {
          await updateConversationStatus(conversationId, { status: "failed", finishedAt: new Date(), errorMessage });
        }
        throw err;
      }
    }
    default:
      throw new Error(`Unknown agents action: ${action}`);
  }
}

async function handleProxyRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return fail("Method not allowed", 405);
  let body: RpcBody;
  try {
    body = (await req.json()) as RpcBody;
  } catch {
    return fail("Invalid JSON");
  }
  const ns = body.ns ?? "";
  const action = body.action ?? "";
  const args = body.args ?? {};
  try {
    if (ns === "kv") return await handleKv(action, args);
    if (ns === "secrets") return await handleSecrets(action, args);
    if (ns === "datatable") return await handleDatatable(action, args);
    if (ns === "agents") return await handleAgents(action, args);
    return fail(`Unknown namespace: ${ns}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof HttpException ? err.statusCode : 400;
    return fail(message, status);
  }
}

type ProxyHandle = { url: string; token: string; stop: () => void };

let hub: ReturnType<typeof Bun.serve> | null = null;
const liveTokens = new Set<string>();

function ensureProxyHub(): NonNullable<typeof hub> {
  if (hub) return hub;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const token = req.headers.get("X-Nonlaagents-Token") ?? "";
      if (!liveTokens.has(token)) return new Response("Forbidden", { status: 403 });
      return handleProxyRequest(req);
    },
  });
  // Don't keep the process alive for the hub alone (bun test / idle). The main
  // HTTP server already pins the production process.
  server.unref();
  hub = server;
  return server;
}

/**
 * Issue a per-run token against a process-wide loopback hub.
 * `stop()` revokes the token; the listen socket is reused across runs.
 */
export function startNonlaagentsProxy(): ProxyHandle {
  const server = ensureProxyHub();
  const token = crypto.randomUUID();
  liveTokens.add(token);
  return {
    url: `http://127.0.0.1:${server.port}`,
    token,
    stop: () => {
      liveTokens.delete(token);
    },
  };
}

/** Test helper — drop tokens and close the shared hub so bun test can exit. */
export function _stopProxyHubForTests(): void {
  liveTokens.clear();
  if (!hub) return;
  try {
    hub.stop(true);
  } catch {
    /* ignore */
  }
  hub = null;
}
