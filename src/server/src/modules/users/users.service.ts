/**
 * Users service — CRUD operations for user management.
 * Admin only.
 */

import { and, eq, ne } from "drizzle-orm";
import { type NewUser, type User, getDb, users } from "../../common/db/client.js";
import { listQuery } from "../../common/db/list-query.util.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { wsHub } from "../../common/ws/wsHub.js";
import { revokeAllRefreshTokensForUser } from "../auth/auth.service.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** User without password hash */
export type SafeUser = Omit<User, "passwordHash">;

function toSafeUser(user: User): SafeUser {
  const { passwordHash: _, ...safe } = user;
  return safe;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export function listUsers(query: Record<string, string>) {
  const result = listQuery(
    {
      table: users,
      searchColumns: ["username", "name"],
    },
    query,
  );

  // Strip passwordHash from all items
  return {
    ...result,
    items: (result.items as User[]).map(toSafeUser),
  };
}

// ─── Get ──────────────────────────────────────────────────────────────────────

export function getUser(id: string): SafeUser | undefined {
  const user = getDb().select().from(users).where(eq(users.id, id)).get();
  if (!user) return undefined;
  return toSafeUser(user);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createUser(body: {
  username: string;
  name: string;
  password: string;
  role?: "admin" | "member";
}): Promise<SafeUser> {
  const { username, name, password, role = "member" } = body;

  // Validate required fields
  if (!username || !password || !name) {
    throw new BadRequestException("Username, name, and password are required");
  }

  if (password.length < 8) {
    throw new BadRequestException("Password must be at least 8 characters");
  }

  // Validate role
  if (role !== "admin" && role !== "member") {
    throw new BadRequestException("Role must be 'admin' or 'member'");
  }

  // Check unique username
  const existingUsername = getDb().select().from(users).where(eq(users.username, username)).get();
  if (existingUsername) {
    throw new BadRequestException("Username already exists");
  }

  const passwordHash = await Bun.password.hash(password);
  const now = new Date();
  const id = crypto.randomUUID();

  const newUser: NewUser = {
    id,
    username,
    name,
    passwordHash,
    role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  getDb().insert(users).values(newUser).run();

  const safe = toSafeUser(newUser as User);
  wsHub.emit("users:created", safe);
  return safe;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function updateUser(id: string, body: { username?: string; name?: string; role?: "admin" | "member" }): SafeUser {
  const db = getDb();
  const existing = db.select().from(users).where(eq(users.id, id)).get();
  if (!existing) {
    throw new BadRequestException("User not found");
  }

  // Check unique username (exclude self)
  if (body.username && body.username !== existing.username) {
    const dup = db
      .select()
      .from(users)
      .where(and(eq(users.username, body.username), ne(users.id, id)))
      .get();
    if (dup) {
      throw new BadRequestException("Username already exists");
    }
  }

  // Build update set
  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  if (body.username) updateSet.username = body.username;
  if (body.name !== undefined) updateSet.name = body.name;
  if (body.role) updateSet.role = body.role;

  db.update(users).set(updateSet).where(eq(users.id, id)).run();
  const updated = db.select().from(users).where(eq(users.id, id)).get();
  if (!updated) throw new BadRequestException("User not found");
  const safe = toSafeUser(updated);
  wsHub.emit("users:updated", safe);
  return safe;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function deleteUser(id: string, currentUserId: string): void {
  const db = getDb();
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user) {
    throw new BadRequestException("User not found");
  }

  // Cannot delete self
  if (id === currentUserId) {
    throw new BadRequestException("Cannot delete yourself");
  }

  revokeAllRefreshTokensForUser(id);
  db.delete(users).where(eq(users.id, id)).run();
  wsHub.emit("users:deleted", { id });
}

// ─── Reset Password ──────────────────────────────────────────────────────────

export async function resetPassword(id: string, body: { password?: string }): Promise<{ password: string }> {
  const db = getDb();
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user) {
    throw new BadRequestException("User not found");
  }

  // Generate or use provided password
  const password = body.password || crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  if (password.length < 8) {
    throw new BadRequestException("Password must be at least 8 characters");
  }

  const passwordHash = await Bun.password.hash(password);
  db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id)).run();
  revokeAllRefreshTokensForUser(id);

  return { password };
}
