/**
 * wsClient — singleton WebSocket connection to the Nonla Agents server.
 *
 * Features:
 *  - JWT via Sec-WebSocket-Protocol (not query string — avoids URL/log leaks)
 *  - Auto-reconnect with exponential back-off (max 30s)
 *  - Typed event subscription via `wsClient.on(type, handler)`
 *  - wsClient.send(type, payload) — send message to server
 *  - CRUD sync events (agents, conversations, tools, …)
 *  - clientId received from server on connect (for targeted events)
 *  - Heartbeat ping every 25s to keep connection alive through proxies
 *
 * Chat tokens stream over SSE, not WebSocket.
 * Public chat (/chat) must NOT connect — guests have no app JWT.
 */

import { getAuthToken } from "../api";

/** Must stay in sync with server `WS_APP_PROTOCOL` / `WS_JWT_PROTOCOL_PREFIX`. */
const WS_APP_PROTOCOL = "nonla-agents";
const WS_JWT_PROTOCOL_PREFIX = "jwt.";

// ─── Types (mirrored from server wsHub — keep in sync) ───────────────────────

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
  | "ping"
  | "client:id";

export interface WsEvent<T = unknown> {
  type: WsEventType;
  payload: T;
}

// ─── Listener registry ────────────────────────────────────────────────────────

type AnyHandler = (payload: unknown) => void;
const listeners = new Map<WsEventType | "*", Set<AnyHandler>>();

function notify(event: WsEvent) {
  const specific = listeners.get(event.type);
  if (specific) {
    for (const fn of specific) fn(event.payload);
  }
  const wildcard = listeners.get("*");
  if (wildcard) {
    for (const fn of wildcard) fn(event);
  }
}

// ─── Connection state ─────────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let retryDelay = 1_000;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let destroyed = false;
let intentionalClose = false;

/** clientId assigned by server on connect — used to correlate targeted events */
let clientId: string | null = null;

function getWsUrl(): string {
  const apiUrl = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "";

  if (apiUrl) {
    // Production: convert http(s) base URL to ws(s)
    return `${apiUrl.replace(/^https?/, (m) => (m === "https" ? "wss" : "ws"))}/ws`;
  }

  // Dev: Vite proxies /ws → server. Use same-origin so proxy works.
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

function connect() {
  if (destroyed) return;

  const token = getAuthToken();
  if (!token) return;

  intentionalClose = false;

  // Replace existing socket if any
  if (ws) {
    intentionalClose = true;
    clearPing();
    if (retryTimeout) clearTimeout(retryTimeout);
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
    intentionalClose = false;
  }

  const url = getWsUrl();
  // Browser cannot set Authorization on WS; pass JWT as a subprotocol.
  // Server echoes only "nonla-agents" (never the jwt.* protocol).
  ws = new WebSocket(url, [WS_APP_PROTOCOL, `${WS_JWT_PROTOCOL_PREFIX}${token}`]);

  ws.onopen = () => {
    retryDelay = 1_000; // reset back-off

    // Heartbeat ping every 25s
    pingInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping", payload: null }));
      }
    }, 25_000);
  };

  ws.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data as string) as WsEvent;

      // Handle clientId assignment from server
      if ((event as { type: string }).type === "client:id") {
        clientId = (event.payload as { clientId: string }).clientId;
        // Also notify listeners so waitForClientId() resolves on reconnect
        notify(event);
        return;
      }

      notify(event);
    } catch {
      // ignore malformed messages
    }
  };

  ws.onclose = () => {
    clearPing();
    clientId = null;
    ws = null;
    if (destroyed || intentionalClose) return;
    // Don't reconnect without a valid token
    if (!getAuthToken()) return;
    retryTimeout = setTimeout(() => {
      retryDelay = Math.min(retryDelay * 2, 30_000);
      connect();
    }, retryDelay);
  };

  ws.onerror = () => {
    // onclose fires right after; we let that handle reconnect
  };
}

function disconnect() {
  intentionalClose = true;
  clearPing();
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  if (ws) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
  }
  clientId = null;
}

function clearPing() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const wsClient = {
  /** Subscribe to a specific event type */
  on<T>(type: WsEventType, handler: (payload: T) => void): () => void {
    let set = listeners.get(type);
    if (!set) {
      set = new Set();
      listeners.set(type, set);
    }
    set.add(handler as AnyHandler);
    return () => listeners.get(type)?.delete(handler as AnyHandler);
  },

  /** Subscribe to ALL events (payload is the full WsEvent) */
  onAny(handler: (event: WsEvent) => void): () => void {
    let set = listeners.get("*");
    if (!set) {
      set = new Set();
      listeners.set("*", set);
    }
    set.add(handler as AnyHandler);
    return () => listeners.get("*")?.delete(handler as AnyHandler);
  },

  /** Send a message to the server */
  send(type: string, payload: unknown) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    } else {
      console.warn("[wsClient] Cannot send — not connected");
    }
  },

  /** Get the current clientId assigned by the server */
  getClientId() {
    return clientId;
  },

  /** Wait until clientId is available (resolves immediately if already set) */
  waitForClientId(): Promise<string> {
    if (clientId) return Promise.resolve(clientId);
    return new Promise((resolve) => {
      const unsub = wsClient.on<{ clientId: string }>("client:id", (payload) => {
        unsub();
        resolve(payload.clientId);
      });
    });
  },

  /** Manually start the connection (called when authenticated app shell mounts) */
  connect,

  /** Close without destroying — used when leaving authenticated routes */
  disconnect,

  /** Tear down — call only when unmounting the whole app */
  destroy() {
    destroyed = true;
    disconnect();
  },

  get readyState() {
    return ws?.readyState ?? WebSocket.CLOSED;
  },
};
