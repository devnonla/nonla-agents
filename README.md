# Nonla Agents

Self-hosted AI agent platform with a web UI. Build agents with TypeScript tools and MCP, schedule Jobs, and publish public chats and Sites — one container, SQLite or PostgreSQL, MIT licensed.

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Runtime](https://img.shields.io/badge/runtime-Bun-f472b6)](https://bun.sh)
[![Docker](https://img.shields.io/badge/docker-devnonla%2Fnonla--agents-2496ED)](https://hub.docker.com/r/devnonla/nonla-agents)

## Quick start

Pull the published image [`devnonla/nonla-agents:latest`](https://hub.docker.com/r/devnonla/nonla-agents) and run:

```bash
docker run -d \
  --name nonla-agents \
  -p 8429:8429 \
  -v nonla-agents-data:/data \
  --security-opt seccomp=unconfined \
  devnonla/nonla-agents:latest
```

Open [http://localhost:8429](http://localhost:8429).

> `seccomp=unconfined` lets bubblewrap sandbox custom tools and site workers. Without it, the app still runs; sandboxed children fall back to unsandboxed execution.

## Docker Compose

Uses the same published image (`devnonla/nonla-agents:latest`).

**SQLite (default)**

```bash
docker compose up -d
```

**PostgreSQL**

```bash
docker compose -f docker-compose.postgres.yml up -d
```

Postgres defaults: user / password / database = `nonla`. Override with `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`.

## Environment

| Variable          | Default   | Description |
| ----------------- | --------- | ----------- |
| `PORT`            | `8429`    | HTTP port |
| `HOST`            | `0.0.0.0` | Bind address |
| `DATA_DIR`        | `/data`   | Persistent data (SQLite file, screenshots, sites, sandboxes) |
| `DATABASE_URL`    | _(unset)_ | Unset → SQLite at `{DATA_DIR}/data.db`. Set `postgres://…` or `postgresql://…` for PostgreSQL |
| `PUBLIC_BASE_URL` | _(auto)_  | Public origin behind a reverse proxy (e.g. `https://agents.example.com`) |

## Features

- **Agents** — Personas, tools, skills, avatars, teams; board drag-and-drop; agent-to-agent calls
- **Models** — OpenAI, Anthropic, Google Gemini, OpenRouter, and more via LangChain
- **Tools** — Custom TypeScript/Bun tools in folders; OS sandbox; builtin browser, fetch, KV, secrets, datatables
- **Skills & memory** — Shared markdown skills (`read_skill`); per-agent knowledge graph
- **Instruct** — Full-page system prompt editor with AI draft review
- **MCP** — Remote MCP servers (SSE / Streamable HTTP); sync catalogs and attach tools; My MCP to expose workspace tools
- **Jobs** — Cron-scheduled Bun/TypeScript scripts with an AI editor
- **Sites** — AI-assisted React sites (`app.tsx` / `backend.ts` / `styles.css`) with draft/publish and public links
- **Chat & sharing** — Live streaming chat; public links with optional passwords and Open Graph cards
- **API keys** — Scoped Bearer keys for `/api/v1` (agents, datatables, KV)
- **Database** — SQLite by default, or PostgreSQL via `DATABASE_URL` / `docker-compose.postgres.yml`

## Data

| Path | Location |
| ---- | -------- |
| Docker | `/data` (bind or named volume) |
| From source | `~/.nonla-agents` by default |

```
<data-dir>/
├── data.db                 # SQLite when DATABASE_URL is unset
├── browser-screenshots/    # Builtin browser tool PNGs
├── agent.pid               # Daemon PID
└── agent.log               # Daemon logs
```

With PostgreSQL, `DATA_DIR` is still used for screenshots, site files, and sandboxes.

## Develop from source

Requires [Bun](https://bun.sh/) ≥ 1.4.

```bash
git clone https://github.com/devnonla/nonla-agents.git
cd nonla-agents
bun install
bun run dev          # API + Vite HMR → http://localhost:5173
# bun run build && bun run start   # production → http://localhost:8429
```

| Script                | Description |
| --------------------- | ----------- |
| `bun run dev`         | API + Vite HMR |
| `bun run build`       | Production build |
| `bun run start`       | Run production server |
| `bun run test`        | Server tests |
| `bun run lint`        | Lint web |
| `bun run typecheck`   | Typecheck web |
| `bun run typecheck:server` | Typecheck server |

### Build the image locally (optional)

For contributors iterating on the image. Production deploys should use `devnonla/nonla-agents:latest` (or a version tag) from Docker Hub.

```bash
docker build -t nonla-agents:local .
docker run -d -p 8429:8429 -v nonla-agents-data:/data \
  --security-opt seccomp=unconfined \
  nonla-agents:local
```

## Tech stack

| Layer | Stack |
| ----- | ----- |
| Runtime | [Bun](https://bun.sh/) |
| API | [Hono](https://hono.dev/) |
| UI | React 19, Vite, Tailwind CSS, NonlaUI |
| Database | SQLite (`bun:sqlite`) or PostgreSQL via `DATABASE_URL` — Drizzle ORM |
| Agents | LangChain / LangGraph |
| State | Redux Toolkit |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Questions belong in [Discussions](https://github.com/devnonla/nonla-agents/discussions).

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
