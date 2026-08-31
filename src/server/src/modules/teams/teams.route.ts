import { Hono } from "hono";
import { createTeam, deleteTeam, listTeams, updateTeam } from "./teams.service.js";

const app = new Hono();

// GET /api/teams?page=1&limit=50&sorts=-createdAt
app.get("/", (c) => {
  return c.json(listTeams(c.req.query()));
});

// POST /api/teams
app.post("/", async (c) => {
  const body = await c.req.json<{ name: string; description?: string }>();
  return c.json(createTeam(body), 201);
});

// PUT /api/teams/:id
app.put("/:id", async (c) => {
  const body = await c.req.json();
  return c.json(updateTeam(c.req.param("id"), body));
});

// DELETE /api/teams/:id
app.delete("/:id", (c) => {
  deleteTeam(c.req.param("id"));
  return c.json({ ok: true });
});

export default app;
