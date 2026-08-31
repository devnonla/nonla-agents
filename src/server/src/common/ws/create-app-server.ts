/**
 * Bun HTTP + WebSocket server factory (used by startServer and integration tests).
 */

import { createApp } from "../../app.js";
import { authenticateWsUpgrade } from "./ws-auth.js";
import { type WsClientData, wsHub } from "./wsHub.js";

export type CreateAppServerOptions = {
  port?: number;
  host?: string;
};

export function createAppServer(options: CreateAppServerOptions = {}) {
  const port = options.port ?? Number(process.env.PORT ?? "15888");
  const host = options.host ?? process.env.HOST ?? "127.0.0.1";
  const app = createApp();

  const server = Bun.serve<WsClientData>({
    async fetch(req, bunServer) {
      if (new URL(req.url).pathname === "/ws") {
        const auth = await authenticateWsUpgrade(req);
        if (auth instanceof Response) return auth;

        const clientId = crypto.randomUUID();
        const upgraded = bunServer.upgrade(req, {
          data: { clientId, userId: auth.userId, role: auth.role },
          ...(auth.acceptProtocol ? { headers: { "Sec-WebSocket-Protocol": auth.acceptProtocol } } : {}),
        });
        if (upgraded) return undefined;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return app.fetch(req, bunServer);
    },
    websocket: {
      open(ws) {
        const { clientId, userId, role } = ws.data;
        wsHub.add(ws, clientId, { userId, role });
        ws.send(JSON.stringify({ type: "client:id", payload: { clientId } }));
      },
      close(ws) {
        wsHub.remove(ws.data.clientId);
      },
      message(_ws, _data) {
        // WS is only used for connection management + broadcasts.
      },
    },
    port,
    hostname: host,
    idleTimeout: 120,
  });

  return server;
}
