/**
 * Auth service — login, password verification, token generation, initial setup.
 */

import { and, eq, isNull } from "drizzle-orm";
import { type User, appSettings, getDb, refreshTokens, users } from "../../common/db/client.js";
import { BadRequestException, UnauthorizedException } from "../../common/exceptions/http.exception.js";
import { type JwtPayload, signToken } from "../../common/middleware/auth.middleware.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** User object without password hash — safe to return to client */
export type SafeUser = Omit<User, "passwordHash">;

export type AuthTokens = {
  token: string;
  refreshToken: string;
  user: SafeUser;
};

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function toSafeUser(user: User): SafeUser {
  const { passwordHash: _, ...safe } = user;
  return safe;
}

function hashRefreshToken(raw: string): string {
  return new Bun.CryptoHasher("sha256").update(raw).digest("hex");
}

function createRefreshTokenRaw(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}

async function issueTokenPair(user: User): Promise<{ token: string; refreshToken: string }> {
  const payload: JwtPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
  };
  const token = await signToken(payload);
  const refreshToken = createRefreshTokenRaw();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TTL_MS);

  getDb()
    .insert(refreshTokens)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt,
      createdAt: now,
      revokedAt: null,
    })
    .run();

  return { token, refreshToken };
}

export function revokeRefreshToken(refreshToken: string | undefined | null): void {
  if (!refreshToken) return;
  getDb()
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenHash, hashRefreshToken(refreshToken)))
    .run();
}

export function revokeAllRefreshTokensForUser(userId: string): void {
  getDb()
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
    .run();
}

// ─── Setup Status ─────────────────────────────────────────────────────────────

export function checkSetupStatus(): { needsSetup: boolean } {
  const userCount = getDb().select().from(users).limit(1).all();
  return { needsSetup: userCount.length === 0 };
}

// ─── Initial Setup ────────────────────────────────────────────────────────────

export async function setupFirstAdmin(body: {
  username: string;
  name: string;
  password: string;
  timezone: string;
}): Promise<AuthTokens> {
  const { username, name, password, timezone } = body;

  // Only allow setup when no users exist
  const { needsSetup } = checkSetupStatus();
  if (!needsSetup) {
    throw new BadRequestException("Setup has already been completed");
  }

  // Validate required fields
  if (!username || !password || !name) {
    throw new BadRequestException("Username, name, and password are required");
  }

  if (password.length < 8) {
    throw new BadRequestException("Password must be at least 8 characters");
  }

  if (!timezone) {
    throw new BadRequestException("Timezone is required");
  }

  const db = getDb();

  // Create admin user
  const passwordHash = await Bun.password.hash(password);
  const now = new Date();
  const id = crypto.randomUUID();

  db.insert(users)
    .values({
      id,
      username,
      name,
      passwordHash,
      role: "admin",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Save timezone to app settings
  db.insert(appSettings)
    .values({ key: "timezone", value: timezone, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: timezone, updatedAt: now } })
    .run();

  // Auto-login — generate JWT + refresh
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user) throw new BadRequestException("Failed to create user");

  const tokens = await issueTokenPair(user);
  return { ...tokens, user: toSafeUser(user) };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(body: {
  username: string;
  password: string;
}): Promise<AuthTokens> {
  const { username, password } = body;

  if (!username || !password) {
    throw new BadRequestException("Username and password are required");
  }

  // Find by username
  const user = getDb().select().from(users).where(eq(users.username, username)).get();

  if (!user) {
    throw new BadRequestException("Invalid username or password");
  }

  if (!user.isActive) {
    throw new BadRequestException("Account is disabled");
  }

  // Verify password
  const valid = await Bun.password.verify(password, user.passwordHash);
  if (!valid) {
    throw new BadRequestException("Invalid username or password");
  }

  const tokens = await issueTokenPair(user);
  return { ...tokens, user: toSafeUser(user) };
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

export async function refreshSession(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
  if (!refreshToken) {
    throw new UnauthorizedException("Refresh token required");
  }

  const db = getDb();
  const hash = hashRefreshToken(refreshToken);
  const row = db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).get();

  if (!row) {
    throw new UnauthorizedException("Invalid refresh token");
  }

  if (row.revokedAt) {
    // Concurrent multi-tab refresh often races within a short window — only treat
    // older revoked tokens as theft and revoke all sessions.
    const revokedAgeMs = Date.now() - row.revokedAt.getTime();
    if (revokedAgeMs > 15_000) {
      revokeAllRefreshTokensForUser(row.userId);
      throw new UnauthorizedException("Refresh token reuse detected");
    }
    throw new UnauthorizedException("Invalid refresh token");
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedException("Refresh token expired");
  }

  const user = db.select().from(users).where(eq(users.id, row.userId)).get();
  if (!user?.isActive) {
    throw new UnauthorizedException("Authentication required");
  }

  const revoked = db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id })
    .all();

  if (revoked.length === 0) {
    // Lost a concurrent refresh race — winner already rotated; do not wipe other sessions.
    throw new UnauthorizedException("Invalid refresh token");
  }

  return issueTokenPair(user);
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export function logout(refreshToken: string | undefined | null): void {
  revokeRefreshToken(refreshToken);
}

// ─── Get current user ─────────────────────────────────────────────────────────

export function getCurrentUser(user: User): SafeUser {
  return toSafeUser(user);
}

// ─── Change password ──────────────────────────────────────────────────────────

export async function changePassword(userId: string, body: { oldPassword: string; newPassword: string }): Promise<void> {
  const { oldPassword, newPassword } = body;

  if (!oldPassword || !newPassword) {
    throw new BadRequestException("Old password and new password are required");
  }

  if (newPassword.length < 8) {
    throw new BadRequestException("New password must be at least 8 characters");
  }

  const user = getDb().select().from(users).where(eq(users.id, userId)).get();

  if (!user) {
    throw new BadRequestException("User not found");
  }

  const valid = await Bun.password.verify(oldPassword, user.passwordHash);
  if (!valid) {
    throw new BadRequestException("Current password is incorrect");
  }

  const newHash = await Bun.password.hash(newPassword);
  getDb().update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, userId)).run();
  revokeAllRefreshTokensForUser(userId);
}

// ─── Update Profile ───────────────────────────────────────────────────────────

export async function updateProfile(userId: string, body: { name?: string; avatar?: string }): Promise<SafeUser> {
  const { name, avatar } = body;
  const db = getDb();

  db.update(users)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(avatar !== undefined ? { avatar } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .run();

  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new BadRequestException("User not found");

  return toSafeUser(user);
}
