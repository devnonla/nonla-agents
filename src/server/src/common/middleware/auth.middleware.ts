/**
 * Auth middleware — JWT verification + role-based access control.
 *
 * Usage in routes:
 *   app.use("*", resolveAuth);          // optional: populate c.get("user")
 *   app.use("*", requireAuth);          // 401 if not authenticated
 *   app.use("*", requireRole("admin")); // 403 if role not allowed
 */

import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { getDb, users } from "../db/client.js";
import { qone, qrun } from "../db/query.js";
import { appSettings } from "../db/schema.js";
import { ForbiddenException, UnauthorizedException } from "../exceptions/http.exception.js";

// ─── JWT Secret ───────────────────────────────────────────────────────────────

let _secret: Uint8Array | null = null;

export async function loadJwtSecret(): Promise<void> {
  if (_secret) return;

  if (process.env.JWT_SECRET) {
    _secret = new TextEncoder().encode(process.env.JWT_SECRET);
    return;
  }

  const db = getDb();
  const row = await qone(db.select().from(appSettings).where(eq(appSettings.key, "jwt_secret")));

  if (row) {
    _secret = new TextEncoder().encode(row.value);
    return;
  }

  const generated = crypto.randomUUID() + crypto.randomUUID();
  await qrun(db.insert(appSettings).values({ key: "jwt_secret", value: generated, updatedAt: new Date() }));
  _secret = new TextEncoder().encode(generated);
}

function getJwtSecret(): Uint8Array {
  if (_secret) return _secret;
  throw new Error("JWT secret not loaded. Call await initDb() / createTestApp() first.");
}

// ─── JWT Helpers ──────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return payload as unknown as JwtPayload;
}

/** HttpOnly cookie used for draft site iframe preview (script/link cannot send Authorization). */
export const ACCESS_TOKEN_COOKIE = "ra_access_token";

export function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function readAccessToken(c: Context): string | null {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) {
    const bearer = header.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookie = parseCookieValue(c.req.header("Cookie"), ACCESS_TOKEN_COOKIE);
  if (cookie) return cookie;
  const queryToken = c.req.query("access_token")?.trim();
  return queryToken || null;
}

export function accessTokenCookieHeader(token: string, maxAgeSec = 3600): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearAccessTokenCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ACCESS_TOKEN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

/** HttpOnly cookie for password-protected public site documents/assets (no token in URL). */
export const SITE_TOKEN_COOKIE_PREFIX = "ra_site_token_";

export function siteTokenCookieName(slug: string): string {
  return `${SITE_TOKEN_COOKIE_PREFIX}${slug}`;
}

export function siteAccessTokenCookieHeader(slug: string, token: string, maxAgeSec = 24 * 60 * 60): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${siteTokenCookieName(slug)}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearSiteAccessTokenCookieHeader(slug: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${siteTokenCookieName(slug)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

// ─── Middleware ────────────────────────────────────────────────────────────────

/**
 * Resolve auth — populate c.get("user") if valid token present.
 * Does NOT throw — allows unauthenticated access.
 */
export async function resolveAuth(c: Context, next: Next) {
  const token = readAccessToken(c);
  if (token && !token.startsWith("ra_")) {
    try {
      const payload = await verifyToken(token);
      // Verify user still exists and is active
      const user = await qone(getDb().select().from(users).where(eq(users.id, payload.sub)));
      if (user?.isActive) {
        (c as any).set("user", user);
      }
    } catch {
      // Invalid token — ignore, user stays null
    }
  }
  await next();
}

/**
 * Require auth — 401 if not authenticated.
 * Must be used AFTER resolveAuth.
 */
export async function requireAuth(c: Context, next: Next) {
  const user = (c as any).get("user");
  if (!user) {
    throw new UnauthorizedException("Authentication required");
  }
  await next();
}

/**
 * Require role — 403 if user's role is not in allowed list.
 * Must be used AFTER requireAuth.
 */
export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = (c as any).get("user") as { role: string } | undefined;
    if (!user) {
      throw new UnauthorizedException("Authentication required");
    }
    if (!roles.includes(user.role)) {
      throw new ForbiddenException("Insufficient permissions");
    }
    await next();
  };
}
