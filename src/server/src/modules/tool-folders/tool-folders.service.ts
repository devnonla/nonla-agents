import { eq } from "drizzle-orm";
import { type NewToolFolder, agentTools, getDb, toolFolders } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { qall, qone, qrun } from "../../common/db/query.js";
import { wsHub } from "../../common/ws/wsHub.js";

async function attachToolIds<T extends { id: string }>(folders: T[]) {
  const toolRows = await qall(getDb().select({ id: agentTools.id, folderId: agentTools.folderId }).from(agentTools));
  return folders.map((f) => ({
    ...f,
    toolIds: toolRows.filter((t) => t.folderId === f.id).map((t) => t.id),
  }));
}

function sortFoldersByOrder<T extends { sortOrder: number; name: string }>(folders: T[]) {
  return [...folders].sort((a, b) => {
    const byOrder = a.sortOrder - b.sortOrder;
    if (byOrder !== 0) return byOrder;
    return a.name.localeCompare(b.name);
  });
}

export async function listToolFolders(query: RawQuery = {}) {
  const result = await listQuery({ table: toolFolders }, query);
  const items = sortFoldersByOrder(await attachToolIds(result.items as Array<(typeof result.items)[number] & { sortOrder: number; name: string }>));
  return { ...result, items };
}

export async function createToolFolder(body: { name: string; description?: string }) {
  const db = getDb();
  const existing = await qall(db.select({ sortOrder: toolFolders.sortOrder }).from(toolFolders));
  const nextOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

  const folder: NewToolFolder = {
    id: crypto.randomUUID(),
    name: body.name,
    description: body.description ?? null,
    sortOrder: nextOrder,
    isActive: true,
    createdAt: new Date(),
  };
  await qrun(db.insert(toolFolders).values(folder));
  const payload = { ...folder, toolIds: [] as string[] };
  wsHub.emit("tool-folders:created", payload);
  return payload;
}

export async function updateToolFolder(id: string, body: Partial<Pick<NewToolFolder, "name" | "description">>) {
  await qrun(getDb().update(toolFolders).set(body).where(eq(toolFolders.id, id)));
  const updated = await qone(getDb().select().from(toolFolders).where(eq(toolFolders.id, id)));
  wsHub.emit("tool-folders:updated", updated);
  return updated;
}

export async function reorderToolFolders(folderIds: string[]) {
  const db = getDb();
  for (let i = 0; i < folderIds.length; i++) {
    await qrun(db.update(toolFolders).set({ sortOrder: i }).where(eq(toolFolders.id, folderIds[i])));
  }
  wsHub.emit("tool-folders:reordered", { folderIds });
  return { folderIds };
}

export async function deleteToolFolder(id: string) {
  await qrun(getDb().delete(toolFolders).where(eq(toolFolders.id, id)));
  wsHub.emit("tool-folders:deleted", { id });
}
