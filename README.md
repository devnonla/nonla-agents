# Nonla Agents

Self-hosted AI agents with a web UI — extend them with TypeScript tools & MCP, schedule them with cron Jobs, and publish them as public chats & Sites. One Docker container, SQLite, MIT.

![License](https://img.shields.io/badge/license-MIT-blue)
![Runtime](https://img.shields.io/badge/runtime-Bun-f472b6)
![Docker](https://img.shields.io/badge/docker-ready-2496ED)

## Features

- 🤖 **Multi-Agent Management** — Create and configure multiple AI agents with personas, tools, and avatars; drag to reorder on the board
- 🧠 **Multi-Provider** — OpenAI, Anthropic, Google Gemini, OpenRouter and more via LangChain
- 🛠️ **Custom Tools** — TypeScript/Bun tools, organized in folders on a tree-style Tools page
- 📚 **Skills** — Shared markdown skill catalog with AI-assisted editing and per-file draft review; assign to agents for progressive disclosure (`read_skill`)
- 🧩 **Memory** — Per-agent user knowledge graph (nodes/edges) via the agent menu and `memory` tool
- 📝 **Instruct** — Full-page system prompt editor with AI draft review (approve or discard); chat uses the live prompt until you approve
- 🔌 **MCP Servers** — Connect remote MCP servers (SSE / Streamable HTTP), sync catalogs, and attach tools to agents
- 🌐 **Browser Tool** — Builtin stealth headless browser for navigate, click, fill, snapshot, and screenshots
- 🔗 **Fetch URL** — Builtin HTTP fetch (`md` / `html` / `raw`) for page and docs reads without a full browser session
- 🗄️ **KV Store** — Key-value storage accessible from tools via `import nonlaagents` (`nonlaagents.kv`)
- 🔐 **Secrets Management** — Encrypted secret storage with AES-256-GCM (`nonlaagents.secrets`)
- 📊 **Datatables** — Workspace tables (projects → tables → rows) with schema editor / agent, per-project tools on the agent flow, and `nonlaagents.datatable`
- 📄 **Sites** — AI-assisted React sites (`app.tsx` / `backend.ts` / `styles.css`) with draft/publish, per-file review, TypeScript/JSON diagnostics, live HTML preview, list thumbnails from preview, and optional public password links
- ⏰ **Jobs** — Cron-scheduled Bun/TypeScript scripts with admin UI, AI editor, and `nonlaagents.agents` to call workspace agents
- 💬 **Real-time Chat** — Live streaming chat with agents; refresh (F5) resumes an in-progress reply
- 🔗 **Public Sharing** — Share agents via public links with optional password protection; Open Graph previews for shared chat and site links
- 🔑 **API Keys** — Settings keys scoped to selected agents, datatable projects, and KV entries (or unrestricted); Bearer auth for `/api/v1`

## Installation

### Option 1: Docker (Recommended)

The easiest way to run Nonla Agents.

```bash
docker run -d \
  --name nonla-agents \
  -p 15888:15888 \
  -v nonla-agents-data:/data \
  devnonla/nonla-agents:latest
```

Open the web UI at [http://localhost:15888](http://localhost:15888).

#### Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  nonla-agents:
    image: devnonla/nonla-agents:latest
    container_name: nonla-agents
    ports:
      - "15888:15888"
    volumes:
      - nonla-agents-data:/data
    restart: unless-stopped

volumes:
  nonla-agents-data:
```

Then run:

```bash
docker compose up -d
```

#### Environment Variables

| Variable          | Default       | Description                                      |
| ----------------- | ------------- | ------------------------------------------------ |
| `PORT`            | `15888`       | Server port                                      |
| `HOST`            | `0.0.0.0`     | Server host                                      |
| `DATA_DIR`        | `/data`       | Data directory                                   |
| `PUBLIC_BASE_URL` | _(auto)_      | Public origin behind reverse proxy (e.g. `https://agents.example.com`). Falls back to browser origin / `X-Forwarded-*`. |

#### Build Docker Image Locally

```bash
docker build -t nonla-agents:local .
docker run -d -p 15888:15888 -v nonla-agents-data:/data nonla-agents:local
```

---

### Option 2: Clone Source

#### Prerequisites

[Bun](https://bun.sh/) runtime ≥ 1.4 is required.

```bash
curl -fsSL https://bun.sh/install | bash
```

#### Setup

```bash
# Clone the repo
git clone https://github.com/devnonla/nonla-agents.git
cd nonla-agents

# Install dependencies
bun install

# Start in development mode (API + Vite HMR)
bun run dev

# Or start in production mode
bun run build
bun run start
```

The web UI will be available at [http://localhost:15888](http://localhost:15888).

#### Available Scripts

| Script               | Description                         |
| -------------------- | ----------------------------------- |
| `bun run dev`        | Start dev servers (API + Vite HMR)  |
| `bun run build`      | Build for production                |
| `bun run start`      | Start production server             |
| `bun run lint`       | Run linter                          |
| `bun run lint:fix`   | Run linter with auto-fix            |
| `bun run format`     | Format code                         |
| `bun run biome:check`| Lint + format check                 |
| `bun run typecheck`  | TypeScript type checking            |

## Data Storage

All data is stored in the data directory (`/data` in Docker, `~/.nonla-agents` by default when running from source):

```
<data-dir>/
├── data.db                 # SQLite database (agents, conversations, settings)
├── browser-screenshots/    # PNGs from the builtin browser tool
├── agent.pid               # PID file (daemon mode)
└── agent.log               # Server logs (daemon mode)
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Server**: [Hono](https://hono.dev/) — lightweight, fast HTTP framework
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + Ant Design
- **Database**: SQLite (`bun:sqlite`) + Drizzle ORM
- **AI**: LangChain (`@langchain/*`)
- **State**: Redux Toolkit

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

[MIT](LICENSE)
