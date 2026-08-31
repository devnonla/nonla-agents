import { count } from "drizzle-orm";
import { Hono } from "hono";
import { agentTeams, agentTools, agents, getDb } from "../../common/db/client.js";

const app = new Hono();

// GET /api/stats — dashboard overview counts
app.get("/", (c) => {
  const db = getDb();

  const [agentCount] = db.select({ value: count() }).from(agents).all();
  const [teamCount] = db.select({ value: count() }).from(agentTeams).all();
  const [toolCount] = db.select({ value: count() }).from(agentTools).all();

  return c.json({
    agents: agentCount.value,
    teams: teamCount.value,
    tools: toolCount.value,
  });
});

export default app;
