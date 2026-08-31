import { eq } from "drizzle-orm";
import { type NewToolFolder, agentTools, getDb, toolFolders } from "../../common/db/client.js";
import { type RawQuery, listQuery } from "../../common/db/list-query.util.js";
import { wsHub } from "../../common/ws/wsHub.js";

function attachToolIds<T extends { id: string }>(folders: T[]) {
  const toolRows = getDb().select({ id: agentTools.id, folderId: agentTools.folderId }).from(agentTools).all();
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

export function listToolFolders(query: RawQuery = {}) {
  const result = listQuery({ table: toolFolders }, query);
  const items = sortFoldersByOrder(attachToolIds(result.items as Array<(typeof result.items)[number] & { sortOrder: number; name: string }>));
  return { ...result, items };
}

export function createToolFolder(body: { name: string; description?: string }) {
  const db = getDb();
  const existing = db.select({ sortOrder: toolFolders.sortOrder }).from(toolFolders).all();
  const nextOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

  const folder: NewToolFolder = {
    id: crypto.randomUUID(),
    name: body.name,
    description: body.description ?? null,
    sortOrder: nextOrder,
    isActive: true,
    createdAt: new Date(),
  };
  db.insert(toolFolders).values(folder).run();
  const payload = { ...folder, toolIds: [] as string[] };
  wsHub.emit("tool-folders:created", payload);
  return payload;
}

export function updateToolFolder(id: string, body: Partial<Pick<NewToolFolder, "name" | "description">>) {
  getDb().update(toolFolders).set(body).where(eq(toolFolders.id, id)).run();
  const updated = getDb().select().from(toolFolders).where(eq(toolFolders.id, id)).get();
  wsHub.emit("tool-folders:updated", updated);
  return updated;
}

export function reorderToolFolders(folderIds: string[]) {
  const db = getDb();
  for (let i = 0; i < folderIds.length; i++) {
    db.update(toolFolders).set({ sortOrder: i }).where(eq(toolFolders.id, folderIds[i])).run();
  }
  wsHub.emit("tool-folders:reordered", { folderIds });
  return { folderIds };
}

export function deleteToolFolder(id: string) {
  getDb().delete(toolFolders).where(eq(toolFolders.id, id)).run();
  wsHub.emit("tool-folders:deleted", { id });
}
