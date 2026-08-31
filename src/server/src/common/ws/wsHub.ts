/**
 * wsHub — singleton WebSocket broadcast hub
 *
 * Supports:
 *   - wsHub.broadcast(type, payload) — fan-out to authenticated clients (role-filtered)
 *   - wsHub.send(clientId, type, payload) — targeted send to one client
 *   - wsHub.emit(type, payload) — alias for broadcast (back-compat)
 *
 * Each connection is assigned a unique clientId on open and must be JWT-authenticated.
 * State/CRUD events use broadcast. Chat tokens stream over SSE, not WS.
 */

import type { ServerWebSocket } from "bun";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WsEventType =
  | "agents:created"
  | "agents:updated"
  | "agents:deleted"
  | "agents:reordered"
  | "agents:tools-updated"
  | "agents:skills-updated"
  | "conversations:created"
  | "conversations:updated"
  | "conversations:deleted"
  | "messages:created"
  | "messages:updated"
  | "teams:created"
  | "teams:updated"
  | "teams:deleted"
  | "tools:created"
  | "tools:updated"
  | "tools:deleted"
  | "tools:reordered"
  | "skills:created"
  | "skills:updated"
  | "skills:deleted"
  | "tool-folders:created"
  | "tool-folders:updated"
  | "tool-folders:deleted"
  | "tool-folders:reordered"
  | "mcp-servers:created"
  | "mcp-servers:updated"
  | "mcp-servers:deleted"
  | "my-mcp-servers:created"
  | "my-mcp-servers:updated"
  | "my-mcp-servers:deleted"
  | "kvstore:created"
  | "kvstore:updated"
  | "kvstore:deleted"
  | "datatables:project-created"
  | "datatables:project-updated"
  | "datatables:project-deleted"
  | "datatables:table-created"
  | "datatables:table-updated"
  | "datatables:table-deleted"
  | "datatables:column-created"
  | "datatables:column-updated"
  | "datatables:column-deleted"
  | "datatables:columns-reordered"
  | "datatables:rows-created"
  | "datatables:row-updated"
  | "datatables:row-deleted"
  | "datatables:rows-deleted"
  | "secrets:created"
  | "secrets:updated"
  | "secrets:deleted"
  | "jobs:created"
  | "jobs:updated"
  | "jobs:deleted"
  | "job_runs:created"
  | "job_runs:updated"
  | "job_runs:log"
  | "sites:created"
  | "sites:updated"
  | "sites:deleted"
  | "bg-tasks:updated"
  | "users:created"
  | "users:updated"
  | "users:deleted"
  | "ping";

export interface WsEvent<T = unknown> {
  type: WsEventType;
  payload: T;
}

export type WsClientData = {
  clientId: string;
  userId: string;
  role: string;
};

type ClientEntry = {
  ws: ServerWebSocket<WsClientData>;
  userId: string;
  role: string;
};

/** secrets:* and jobs:* are admin-only; all other CRUD events go to any authenticated client. */
export function clientMayReceive(role: string, type: WsEventType): boolean {
  if (type.startsWith("secrets:") || type.startsWith("jobs:") || type.startsWith("job_runs:")) return role === "admin";
  return true;
}

// ─── Hub ──────────────────────────────────────────────────────────────────────

class WsHub {
  private clients = new Map<string, ClientEntry>();

  add(ws: ServerWebSocket<WsClientData>, clientId: string, meta: { userId: string; role: string }) {
    this.clients.set(clientId, { ws, userId: meta.userId, role: meta.role });
  }

  remove(clientId: string) {
    this.clients.delete(clientId);
  }

  /** Broadcast to connected clients allowed to receive this event type */
  broadcast<T>(type: WsEventType, payload: T) {
    if (this.clients.size === 0) return;
    const msg = JSON.stringify({ type, payload } satisfies WsEvent<T>);
    for (const client of this.clients.values()) {
      if (!clientMayReceive(client.role, type)) continue;
      try {
        client.ws.send(msg);
      } catch {
        // ignore dead sockets — will be removed on close
      }
    }
  }

  /** Send to a specific client by clientId */
  send<T>(clientId: string, type: WsEventType, payload: T) {
    const client = this.clients.get(clientId);
    if (!client) return false;
    if (!clientMayReceive(client.role, type)) return false;
    try {
      client.ws.send(JSON.stringify({ type, payload } satisfies WsEvent<T>));
      return true;
    } catch {
      return false;
    }
  }

  /** Alias for broadcast — back-compat with existing route code */
  emit<T>(type: WsEventType, payload: T) {
    this.broadcast(type, payload);
  }

  get size() {
    return this.clients.size;
  }

  /** Test helper — drop all tracked clients without closing sockets. */
  _resetForTests() {
    this.clients.clear();
  }
}

export const wsHub = new WsHub();
