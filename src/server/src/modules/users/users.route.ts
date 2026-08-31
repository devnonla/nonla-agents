/**
 * Users routes — CRUD for user management.
 * All routes require admin+ role.
 */

import { Hono } from "hono";
import type { User } from "../../common/db/client.js";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { requireRole } from "../../common/middleware/auth.middleware.js";
import { createUser, deleteUser, getUser, listUsers, resetPassword, updateUser } from "./users.service.js";

const app = new Hono();

// All users routes require admin
app.use("*", requireRole("admin"));

// GET /api/users
app.get("/", (c) => {
  const query = c.req.query();
  return c.json(listUsers(query));
});

// GET /api/users/:id
app.get("/:id", (c) => {
  const user = getUser(c.req.param("id"));
  if (!user) throw new BadRequestException("User not found");
  return c.json(user);
});

// POST /api/users
app.post("/", async (c) => {
  const body = await c.req.json();
  const user = await createUser(body);
  return c.json(user, 201);
});

// PUT /api/users/:id
app.put("/:id", async (c) => {
  const body = await c.req.json();
  const user = updateUser(c.req.param("id"), body);
  return c.json(user);
});

// DELETE /api/users/:id
app.delete("/:id", (c) => {
  const currentUser = (c as any).get("user") as User;
  deleteUser(c.req.param("id"), currentUser.id);
  return c.json({ ok: true });
});

// POST /api/users/:id/reset-password
app.post("/:id/reset-password", async (c) => {
  const body = await c.req.json<{ password?: string }>();
  const result = await resetPassword(c.req.param("id"), body);
  return c.json(result);
});

export default app;
