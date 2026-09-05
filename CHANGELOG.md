# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-09-05

### Added

- Sites bundle CSS from `styles.css` through Bun.build instead of a hand-rolled minifier
- Restyled default site starter (blank-canvas copy and a ping demo)

### Changed

- Site assistant no longer embeds draft files in the system prompt — it reads first and verifies with at most one `check_site` per turn
- Coding agents keep the latest successful edit snapshot in history so later edits are not made from `[omitted]` placeholders
- Untrusted tool, job, and site TypeScript is rewritten before Bun runs it (caret regex literals and `@ts-nocheck`)

### Fixed

- Refuse writing compacted `[omitted — …]` placeholders into tools, jobs, skills, and site files
- Child processes no longer fail with `posix_spawn` EBADF on macOS when many file descriptors are open
- Monaco diff editor no longer throws when disposing models
- Chat auto-scroll follows new messages more closely

### Upgrade notes

- Pull or rebuild the Docker image. No database migration. Existing published sites are unchanged; newly created sites use the new starter.

## [0.1.0] - 2026-08-26

First public release of **Nonla Agents** — self-hosted AI agents with a web UI, TypeScript tools, MCP, Jobs, and Sites. One Docker container, SQLite, MIT.

### Added

**Agents**
- Create and configure agents (persona, avatar, model, tools, skills); clone; group by team
- Board: drag agents between teams or ungrouped; persisted order
- Chat with live streaming; refresh (F5) resumes an in-progress reply
- Instruct: full-page system prompt editor with AI draft (approve or discard); chat uses the live prompt until you approve
- Memory: per-agent knowledge graph (nodes/edges) in the agent menu and via the `memory` tool
- Flow canvas: attach tools, skills, MCP tools, datatable projects, and callable sub-agents
- Agent-to-agent calls (`call_agent`); background tasks (`background_tasks`)
- Public chat links with optional password; generated Open Graph cards

**Tools & skills**
- Custom TypeScript/Bun tools (`export default async function main(input)`, `// @name`); packages via `bun add`
- Tools page: folders, tree, AI coding assistant, run panel
- OS sandbox (bubblewrap / Seatbelt), stripped env, loopback `nonlaagents` proxy, compile-file cache, 120s default timeout / 10-minute hard cap, concurrency cap 16
- Builtin tools: `browser` (stealth Chromium), `fetch_url`, `kv_store`, `secrets`, `datatable`, `memory`, `read_skill`, `get_current_time`, `background_tasks`, `get_tool_schema`
- Skills: markdown catalog, AI-assisted editing, per-file draft review, assign to agents (`read_skill`)

**Capabilities**
- MCP servers: connect remote SSE / Streamable HTTP, sync catalogs, attach tools to agents
- My MCP: expose workspace custom tools as an MCP server (`ra_mcp_…` token)
- Sites: AI-assisted React (`app.tsx` / `backend.ts` / `styles.css`), draft/publish, per-file review, TypeScript/JSON diagnostics, live preview, thumbnails, optional public password
- Jobs: cron-scheduled Bun/TypeScript scripts, admin UI, AI editor, `nonlaagents.agents` to call workspace agents
- Datatables: projects → tables → rows, schema editor / agent, query `where` as object (AND) or array of objects (OR), per-project tools on the agent flow
- KV store and encrypted secrets (AES-256-GCM), usable from tools/jobs/sites via `import nonlaagents`

**Platform**
- Multi-provider LLMs via LangChain (OpenAI, Anthropic, Google Gemini, OpenRouter, …)
- First-run setup, login, users/roles, profile
- Settings: timezone, default models, LLM providers, scoped API keys
- HTTP API (`/api/v1`): Bearer keys scoped to agents, datatable projects, and KV; chat (SSE or non-stream), datatables, KV; copyable scope-aware docs
- Realtime WebSocket (`nonla-agents` subprotocol) for CRUD and chat events
- Dashboard, Docker image `devnonla/nonla-agents`, data in `/data` (Docker) or `~/.nonla-agents` (source)
- Workspace SDK: `import nonlaagents` (`kv`, `secrets`, `datatable`, `agents`); env `NONLAAGENTS_URL` / `NONLAAGENTS_TOKEN`; header `X-Nonlaagents-Token`

[Unreleased]: https://github.com/devnonla/nonla-agents/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/devnonla/nonla-agents/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/devnonla/nonla-agents/releases/tag/v0.1.0
