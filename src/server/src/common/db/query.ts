/**
 * Dialect-agnostic Drizzle helpers.
 * SQLite builders expose sync `.get/.all/.run`; Postgres builders are thenable.
 * Always `await` these so both dialects work.
 */

export async function qall<T>(query: PromiseLike<T[]> | { all: () => T[] }): Promise<T[]> {
  const q = query as { all?: () => T[] };
  if (typeof q.all === "function") return q.all();
  return [...(await (query as PromiseLike<T[]>))];
}

export async function qone<T>(query: PromiseLike<T[]> | { get: () => T | undefined }): Promise<T | undefined> {
  const q = query as { get?: () => T | undefined };
  if (typeof q.get === "function") return q.get();
  const rows = await (query as PromiseLike<T[]>);
  return rows[0];
}

export async function qrun(query: PromiseLike<unknown> | { run: () => unknown }): Promise<void> {
  const q = query as { run?: () => unknown };
  if (typeof q.run === "function") {
    q.run();
    return;
  }
  await query;
}
