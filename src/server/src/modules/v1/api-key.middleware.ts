import type { Context, Next } from "hono";
import { UnauthorizedException } from "../../common/exceptions/http.exception.js";
import { type ApiKeyContext, authenticateApiKey } from "../api-keys/api-keys.service.js";

export type { ApiKeyContext };

export async function requireApiKey(c: Context, next: Next) {
  const header = c.req.header("Authorization");
  const raw = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const apiKey = raw ? authenticateApiKey(raw) : null;
  if (!apiKey) {
    throw new UnauthorizedException("Invalid API key");
  }
  c.set("apiKey", apiKey);
  await next();
}

export function getApiKey(c: Context): ApiKeyContext {
  const apiKey = c.get("apiKey") as ApiKeyContext | undefined;
  if (!apiKey) throw new UnauthorizedException("Invalid API key");
  return apiKey;
}
