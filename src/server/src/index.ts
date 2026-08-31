import { closeDb, getDb } from "./common/db/client.js";
import { getDataDir } from "./common/utils/data-dir.js";
import { createAppServer } from "./common/ws/create-app-server.js";
import { startJobsScheduler, stopJobsScheduler } from "./modules/jobs/jobs-scheduler.js";

export interface ServerOptions {
  port?: number;
  host?: string;
  dataDir?: string;
}

export async function startServer(options: ServerOptions = {}): Promise<void> {
  const port = options.port ?? Number(process.env.PORT ?? "15888");
  const host = options.host ?? process.env.HOST ?? "127.0.0.1";
  const dataDir = options.dataDir ?? getDataDir();

  process.env.DATA_DIR = dataDir;
  getDb(dataDir);
  startJobsScheduler();

  const server = createAppServer({ port, host });

  const shutdown = () => {
    stopJobsScheduler();
    closeDb();
    server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (import.meta.main) {
  startServer();
}
