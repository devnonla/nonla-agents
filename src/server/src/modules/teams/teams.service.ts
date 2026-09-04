import { eq } from "drizzle-orm";
import { type NewAgentTeam, agentTeams, agents, getDb } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { qall, qone, qrun } from "../../common/db/query.js";
import { wsHub } from "../../common/ws/wsHub.js";

export async function listTeams(query: RawQuery = {}) {
  const db = getDb();
  const result = await listQuery({ table: agentTeams }, query);
  const agentRows = await qall(db.select({ id: agents.id, teamId: agents.teamId }).from(agents));
  const items = result.items.map((t: any) => ({
    ...t,
    agentIds: agentRows.filter((a) => a.teamId === t.id).map((a) => a.id),
  }));
  return { ...result, items };
}

export async function createTeam(body: { name: string; description?: string }) {
  const team: NewAgentTeam = {
    id: crypto.randomUUID(),
    name: body.name,
    description: body.description ?? null,
    isActive: true,
    createdAt: new Date(),
  };
  await qrun(getDb().insert(agentTeams).values(team));
  const payload = { ...team, members: [] };
  wsHub.emit("teams:created", payload);
  return payload;
}

export async function updateTeam(id: string, body: Partial<Pick<NewAgentTeam, "name" | "description">>) {
  await qrun(getDb().update(agentTeams).set(body).where(eq(agentTeams.id, id)));
  const updated = await qone(getDb().select().from(agentTeams).where(eq(agentTeams.id, id)));
  wsHub.emit("teams:updated", updated);
  return updated;
}

export async function deleteTeam(id: string) {
  await qrun(getDb().delete(agentTeams).where(eq(agentTeams.id, id)));
  wsHub.emit("teams:deleted", { id });
}
