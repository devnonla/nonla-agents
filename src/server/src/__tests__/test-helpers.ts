/**
 * Test helpers — shared utilities for API integration tests.
 *
 * Provides an in-memory SQLite DB + Hono app for each test suite,
 * plus helper functions for authentication.
 */

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Hono } from "hono";
import * as schema from "../common/db/schema.js";

// ─── In-Memory DB Setup ──────────────────────────────────────────────────────

/**
 * Create a fresh in-memory SQLite database with all tables.
 * Returns the drizzle instance and the raw Database for cleanup.
 */
function createTestDb() {
  const raw = new Database(":memory:");
  raw.exec("PRAGMA journal_mode = WAL;");
  raw.exec("PRAGMA foreign_keys = ON;");

  // Create all tables from schema
  raw.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      avatar TEXT,
      system_prompt TEXT,
      system_prompt_draft TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_public INTEGER NOT NULL DEFAULT 0,
      public_password TEXT,
      ai_provider TEXT,
      ai_model TEXT,
      callable_agent_ids TEXT NOT NULL DEFAULT '[]',
      team_id TEXT REFERENCES agent_teams(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS memory_nodes (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL DEFAULT 'user',
      content TEXT NOT NULL,
      source_conversation_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS memory_edges (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL DEFAULT 'user',
      from_id TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
      to_id TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
      relation TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (from_id, to_id, relation)
    );

    CREATE TABLE IF NOT EXISTS agent_teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agent_conversations (
      id TEXT PRIMARY KEY,
      agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
      owner_id TEXT NOT NULL DEFAULT 'user',
      title TEXT NOT NULL,
      trigger TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'running',
      error_message TEXT,
      summary TEXT,
      summary_updated_at INTEGER,
      started_at INTEGER,
      finished_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE CASCADE,
      chat_agent_id TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      content TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS tool_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agent_tools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT,
      parameters TEXT NOT NULL DEFAULT '{"type":"object","properties":{},"required":[]}',
      code_content TEXT NOT NULL,
      draft_code TEXT,
      folder_id TEXT REFERENCES tool_folders(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agent_tool_assignments (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      tool_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      headers TEXT NOT NULL DEFAULT '{}',
      tools TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_sync_error TEXT,
      last_synced_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS configurations (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS kv_store (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS secrets (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS datatable_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS datatable_tables (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES datatable_projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (project_id, name)
    );

    CREATE TABLE IF NOT EXISTS datatable_columns (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL REFERENCES datatable_tables(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      options TEXT,
      required INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (table_id, name)
    );

    CREATE TABLE IF NOT EXISTS datatable_rows (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL REFERENCES datatable_tables(id) ON DELETE CASCADE,
      data TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS llm_providers (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      label TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      custom_base_url TEXT NOT NULL DEFAULT '',
      models TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      is_published INTEGER NOT NULL DEFAULT 0,
      public_password TEXT,
      deps_status TEXT NOT NULL DEFAULT 'ready',
      deps_error TEXT,
      draft_deps_status TEXT NOT NULL DEFAULT 'ready',
      draft_deps_error TEXT,
      draft_updated_at INTEGER,
      created_by TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      avatar TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      revoked_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      code TEXT NOT NULL DEFAULT '',
      draft_code TEXT,
      cron TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      timeout_ms INTEGER NOT NULL DEFAULT 300000,
      next_run_at INTEGER,
      last_run_at INTEGER,
      lease_owner TEXT,
      lease_until INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS job_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'running',
      trigger TEXT NOT NULL DEFAULT 'cron',
      logs TEXT NOT NULL DEFAULT '',
      error TEXT,
      instance_id TEXT,
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      finished_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      draft_content TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS skill_references (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      draft_content TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (skill_id, name)
    );

    CREATE TABLE IF NOT EXISTS agent_skill_assignments (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (agent_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_used_at INTEGER,
      revoked_at INTEGER,
      agents_unrestricted INTEGER NOT NULL DEFAULT 0,
      datatables_unrestricted INTEGER NOT NULL DEFAULT 0,
      kv_unrestricted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS api_key_agents (
      api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      PRIMARY KEY (api_key_id, agent_id)
    );

    CREATE TABLE IF NOT EXISTS api_key_datatable_projects (
      api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES datatable_projects(id) ON DELETE CASCADE,
      PRIMARY KEY (api_key_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS api_key_kv_entries (
      api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      kv_entry_id TEXT NOT NULL REFERENCES kv_store(id) ON DELETE CASCADE,
      PRIMARY KEY (api_key_id, kv_entry_id)
    );

    CREATE TABLE IF NOT EXISTS my_mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS my_mcp_server_tools (
      server_id TEXT NOT NULL REFERENCES my_mcp_servers(id) ON DELETE CASCADE,
      tool_id TEXT NOT NULL REFERENCES agent_tools(id) ON DELETE CASCADE,
      PRIMARY KEY (server_id, tool_id)
    );

    CREATE TABLE IF NOT EXISTS __migrations (
      name TEXT PRIMARY KEY,
      ran_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  const db = drizzle(raw, { schema });
  return { db, raw };
}

// ─── App + Auth Helpers ──────────────────────────────────────────────────────

import { createApp } from "../app.js";
import { _resetSecretEncryptionKeyCache, loadSecretEncryptionKey } from "../common/crypto/secret-crypto.js";
import { _resetDb, _setTestDb } from "../common/db/client.js";
import { loadJwtSecret } from "../common/middleware/auth.middleware.js";
import { getConfiguredTimezone } from "../common/utils/cronHelper.js";

/**
 * Create a full Hono app backed by a fresh in-memory DB.
 * Returns the app, db, and a cleanup function.
 */
export async function createTestApp() {
  const { db, raw } = createTestDb();

  // Inject the test DB into the singleton so all services use it
  _setTestDb(db, raw);
  _resetSecretEncryptionKeyCache();
  await loadSecretEncryptionKey();
  await loadJwtSecret();
  await getConfiguredTimezone();

  const app = createApp();

  return {
    app,
    db,
    raw,
    cleanup: () => {
      raw.close();
      _resetDb();
      _resetSecretEncryptionKeyCache();
    },
  };
}

/**
 * Setup an admin user via the /api/auth/setup endpoint.
 * Returns the JWT token for subsequent authenticated requests.
 */
export async function setupAdmin(app: Hono, opts?: { username?: string; name?: string; password?: string; timezone?: string }) {
  const body = {
    username: opts?.username ?? "admin",
    name: opts?.name ?? "Admin User",
    password: opts?.password ?? "password123",
    timezone: opts?.timezone ?? "Asia/Ho_Chi_Minh",
  };

  const res = await app.request("/api/auth/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { token: string; refreshToken: string; user: Record<string, unknown> };
  return { token: data.token, refreshToken: data.refreshToken, user: data.user, ...body };
}

/**
 * Create Authorization header from a JWT token.
 */
export function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Helper to make authenticated JSON requests.
 */
export async function authRequest(app: Hono, token: string, method: string, path: string, body?: unknown) {
  const options: RequestInit = {
    method,
    headers: authHeaders(token),
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  return app.request(path, options);
}
