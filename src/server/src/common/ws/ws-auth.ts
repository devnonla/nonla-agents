/**
 * WebSocket upgrade auth — no JWT in the URL query string.
 *
 * Token sources (first match wins):
 *   1. Authorization: Bearer <jwt>
 *   2. Sec-WebSocket-Protocol: "nonla-agents", "jwt.<jwt>"
 *      (browser-safe; selected protocol echoed back is only "nonla-agents")
 */

import { eq } from "drizzle-orm";
import { getDb, users } from "../db/client.js";
import { qone } from "../db/query.js";
import { verifyToken } from "../middleware/auth.middleware.js";

export const WS_APP_PROTOCOL = "nonla-agents";
export const WS_JWT_PROTOCOL_PREFIX = "jwt.";

export type WsAuthSuccess = {
  userId: string;
  role: string;
  /** Echo this Sec-WebSocket-Protocol value on upgrade when client offered it. */
  acceptProtocol?: string;
};

function parseProtocols(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Extract JWT from Authorization header or Sec-WebSocket-Protocol. */
export function extractWsToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }

  for (const proto of parseProtocols(req.headers.get("Sec-WebSocket-Protocol"))) {
    if (proto.startsWith(WS_JWT_PROTOCOL_PREFIX)) {
      const token = proto.slice(WS_JWT_PROTOCOL_PREFIX.length).trim();
      if (token) return token;
    }
  }

  return null;
}

/**
 * Authenticate a /ws upgrade request.
 * Returns user meta on success, or a 401 Response on failure.
 */
export async function authenticateWsUpgrade(req: Request): Promise<WsAuthSuccess | Response> {
  const token = extractWsToken(req);
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await verifyToken(token);
    const user = await qone(getDb().select().from(users).where(eq(users.id, payload.sub)));
    if (!user?.isActive) {
      return new Response("Unauthorized", { status: 401 });
    }

    const protocols = parseProtocols(req.headers.get("Sec-WebSocket-Protocol"));
    const acceptProtocol = protocols.includes(WS_APP_PROTOCOL) ? WS_APP_PROTOCOL : undefined;

    return {
      userId: user.id,
      role: user.role,
      acceptProtocol,
    };
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}
