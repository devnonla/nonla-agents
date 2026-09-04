import { count } from "drizzle-orm";
import { Hono } from "hono";
import { agentTeams, agentTools, agents, getDb } from "../../common/db/client.js";
import { qall } from "../../common/db/query.js";

const app = new Hono();

// GET /api/stats — dashboard overview counts
app.get("/", async (c) => {
  const db = getDb();

  const [agentCount] = await qall(db.select({ value: count() }).from(agents));
  const [teamCount] = await qall(db.select({ value: count() }).from(agentTeams));
  const [toolCount] = await qall(db.select({ value: count() }).from(agentTools));

  return c.json({
    agents: agentCount.value,
    teams: teamCount.value,
    tools: toolCount.value,
  });
});

export default app;
