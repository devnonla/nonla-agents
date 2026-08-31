import { eq } from "drizzle-orm";
import { type NewAgentTeam, agentTeams, agents, getDb } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { wsHub } from "../../common/ws/wsHub.js";

export function listTeams(query: RawQuery = {}) {
  const db = getDb();
  const result = listQuery({ table: agentTeams }, query);
  const agentRows = db.select({ id: agents.id, teamId: agents.teamId }).from(agents).all();
  const items = result.items.map((t: any) => ({
    ...t,
    agentIds: agentRows.filter((a) => a.teamId === t.id).map((a) => a.id),
  }));
  return { ...result, items };
}

export function createTeam(body: { name: string; description?: string }) {
  const team: NewAgentTeam = {
    id: crypto.randomUUID(),
    name: body.name,
    description: body.description ?? null,
    isActive: true,
    createdAt: new Date(),
  };
  getDb().insert(agentTeams).values(team).run();
  const payload = { ...team, members: [] };
  wsHub.emit("teams:created", payload);
  return payload;
}

export function updateTeam(id: string, body: Partial<Pick<NewAgentTeam, "name" | "description">>) {
  getDb().update(agentTeams).set(body).where(eq(agentTeams.id, id)).run();
  const updated = getDb().select().from(agentTeams).where(eq(agentTeams.id, id)).get();
  wsHub.emit("teams:updated", updated);
  return updated;
}

export function deleteTeam(id: string) {
  getDb().delete(agentTeams).where(eq(agentTeams.id, id)).run();
  wsHub.emit("teams:deleted", { id });
}
