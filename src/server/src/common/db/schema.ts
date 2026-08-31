import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ─── Agents ───────────────────────────────────────────────────────────────────

export const agents = sqliteTable("agents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  /** react-nice-avatar JSON config (or image URL) */
  avatar: text("avatar"),
  systemPrompt: text("system_prompt"),
  /** Pending AI / editor draft. Chat uses `systemPrompt` until the user approves. */
  systemPromptDraft: text("system_prompt_draft"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  publicPassword: text("public_password"), // Mật khẩu cho link public (optional)
  // Per-agent AI config — aiProvider stores the UUID from llmProviders table
  aiProvider: text("ai_provider"),
  aiModel: text("ai_model"),

  /** JSON array of agent UUIDs this agent can delegate to (one call_agent__* tool each) */
  callableAgentIds: text("callable_agent_ids", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  /** Which team this agent belongs to (denormalized for simpler queries) */
  teamId: text("team_id").references(() => agentTeams.id, {
    onDelete: "set null",
  }),
  /** Display order within a team (or ungrouped) */
  sortOrder: integer("sort_order").notNull().default(0),
  /** Which user created this agent */
  createdBy: text("created_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

// ─── User Memory Graph ────────────────────────────────────────────────────────
// Per-user knowledge graph for an agent. Loaded on demand via the `memory`
// tool (search / neighbors / list). Nodes are untyped facts; edge
// relations are free-form short labels (normalized snake_case).

export const MEMORY_RELATION_MAX = 40;

export const memoryNodes = sqliteTable("memory_nodes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull().default("user"),
  content: text("content").notNull(),
  sourceConversationId: text("source_conversation_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type MemoryNode = typeof memoryNodes.$inferSelect;
export type NewMemoryNode = typeof memoryNodes.$inferInsert;

export const memoryEdges = sqliteTable("memory_edges", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull().default("user"),
  fromId: text("from_id")
    .notNull()
    .references(() => memoryNodes.id, { onDelete: "cascade" }),
  toId: text("to_id")
    .notNull()
    .references(() => memoryNodes.id, { onDelete: "cascade" }),
  relation: text("relation").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type MemoryEdge = typeof memoryEdges.$inferSelect;
export type NewMemoryEdge = typeof memoryEdges.$inferInsert;

// ─── Agent Teams ──────────────────────────────────────────────────────────────

export const agentTeams = sqliteTable("agent_teams", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AgentTeam = typeof agentTeams.$inferSelect;
export type NewAgentTeam = typeof agentTeams.$inferInsert;

// ─── Conversations ───────────────────────────────────────────────────────────
// Mỗi conversation là 1 phiên chat: manual (user gõ tay) hoặc task (agent tự chạy)
export const agentConversations = sqliteTable("agent_conversations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id").references(() => agents.id, {
    onDelete: "set null",
  }),
  ownerId: text("owner_id").notNull().default("user"),
  title: text("title").notNull(),
  trigger: text("trigger", { enum: ["manual", "cron", "api", "meeting", "public"] })
    .notNull()
    .default("manual"),
  status: text("status", { enum: ["running", "done", "failed"] })
    .notNull()
    .default("running"),
  errorMessage: text("error_message"),
  summary: text("summary"),
  summaryUpdatedAt: integer("summary_updated_at", { mode: "timestamp" }),
  startedAt: integer("started_at", { mode: "timestamp" }),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AgentConversation = typeof agentConversations.$inferSelect;
export type NewAgentConversation = typeof agentConversations.$inferInsert;

// ─── Messages ─────────────────────────────────────────────────────────────────
// Messages thuộc về một conversation cụ thể.

export const agentMessages = sqliteTable("agent_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /**
   * The agent this message is addressed TO (the AI agent being chatted with).
   */
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  /**
   * Conversation this message belongs to.
   * null → legacy orphan messages
   */
  conversationId: text("conversation_id").references(() => agentConversations.id, { onDelete: "cascade" }),
  /**
   * For agent-to-agent chat: the other agent's ID.
   * null → human / task
   */
  chatAgentId: text("chat_agent_id"),
  role: text("role", { enum: ["user", "assistant", "tool", "thinking"] })
    .notNull()
    .default("user"),
  content: text("content").notNull(),
  /** JSON metadata: { toolName, toolLabel, input, output, usage } */
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AgentMessage = typeof agentMessages.$inferSelect;
export type NewAgentMessage = typeof agentMessages.$inferInsert;

// ─── MCP Servers ──────────────────────────────────────────────────────────────

/** Catalog entry synced from a remote MCP server (listTools). */
export type McpCatalogTool = {
  name: string;
  description: string;
  inputSchema: object;
};

export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  url: text("url").notNull(),
  /** JSON object: custom headers for auth etc. */
  headers: text("headers", { mode: "json" }).$type<Record<string, string>>().notNull().default(sql`'{}'`),
  /** Synced MCP tool catalog — enable/disable is per-agent via assignments. */
  tools: text("tools", { mode: "json" }).$type<McpCatalogTool[]>().notNull().default(sql`'[]'`),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  /** Last sync failure message; null when the latest sync succeeded. */
  lastSyncError: text("last_sync_error"),
  /** Timestamp of the last sync attempt (success or failure). */
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type McpServer = typeof mcpServers.$inferSelect;
export type NewMcpServer = typeof mcpServers.$inferInsert;

// ─── Tool Folders ─────────────────────────────────────────────────────────────

export const toolFolders = sqliteTable("tool_folders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type ToolFolder = typeof toolFolders.$inferSelect;
export type NewToolFolder = typeof toolFolders.$inferInsert;

// ─── Custom Tools ─────────────────────────────────────────────────────────────

export const agentTools = sqliteTable("agent_tools", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(), // snake_case identifier
  label: text("label").notNull(),
  description: text("description").notNull(),
  /** SVG markup (Iconify Lucide) shown next to the tool name in the UI */
  icon: text("icon"),
  parameters: text("parameters", { mode: "json" }).$type<object>().notNull().default(sql`'{"type":"object","properties":{},"required":[]}'`),
  codeContent: text("code_content").notNull(),
  /** AI draft code — written by edit_code tool. null = no pending draft. */
  draftCode: text("draft_code"),
  /** Optional folder for grouping in the Tools UI */
  folderId: text("folder_id").references(() => toolFolders.id, {
    onDelete: "set null",
  }),
  /** Order within folder (or ungrouped when folderId is null) */
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AgentTool = typeof agentTools.$inferSelect;
export type NewAgentTool = typeof agentTools.$inferInsert;

// ─── Agent Tool Assignments (junction table) ──────────────────────────────────
// Maps agents ↔ tools with per-assignment metadata (parameters).
// tool_id FK cascade: deleting a tool auto-removes all its assignments.

export const agentToolAssignments = sqliteTable("agent_tool_assignments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  toolId: text("tool_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AgentToolAssignment = typeof agentToolAssignments.$inferSelect;
export type NewAgentToolAssignment = typeof agentToolAssignments.$inferInsert;

// ─── App Settings ─────────────────────────────────────────────────────────────

export const appSettings = sqliteTable("configurations", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AppSetting = typeof appSettings.$inferSelect;

// ─── LLM Providers ─────────────────────────────────────────────────────────────

export const llmProviders = sqliteTable("llm_providers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  provider: text("provider").notNull(), // "openai" | "openrouter" | "google" | ...
  label: text("label").notNull(), // human-readable name
  apiKey: text("api_key").notNull().default(""),
  customBaseUrl: text("custom_base_url").notNull().default(""),
  /** Cached list of model IDs from the provider's /models endpoint */
  models: text("models", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type LlmProvider = typeof llmProviders.$inferSelect;
export type NewLlmProvider = typeof llmProviders.$inferInsert;

// ─── Users ────────────────────────────────────────────────────────────────────
// User accounts for authentication and authorization.

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  username: text("username").notNull().unique(),
  name: text("name").notNull().default(""),
  avatar: text("avatar"),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "member"] })
    .notNull()
    .default("member"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

export const refreshTokens = sqliteTable("refresh_tokens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
});

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

// ─── KV Store ─────────────────────────────────────────────────────────────────

export const kvStore = sqliteTable("kv_store", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type KvStoreEntry = typeof kvStore.$inferSelect;
export type NewKvStoreEntry = typeof kvStore.$inferInsert;

// ─── Secrets ──────────────────────────────────────────────────────────────────

export const secrets = sqliteTable("secrets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type SecretEntry = typeof secrets.$inferSelect;
export type NewSecretEntry = typeof secrets.$inferInsert;

// ─── Datatables ───────────────────────────────────────────────────────────────

export const COLUMN_TYPES = ["text", "number", "boolean", "datetime", "select", "json"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const datatableProjects = sqliteTable("datatable_projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type DatatableProject = typeof datatableProjects.$inferSelect;
export type NewDatatableProject = typeof datatableProjects.$inferInsert;

export const datatableTables = sqliteTable("datatable_tables", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => datatableProjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type DatatableTable = typeof datatableTables.$inferSelect;
export type NewDatatableTable = typeof datatableTables.$inferInsert;

export const datatableColumns = sqliteTable("datatable_columns", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tableId: text("table_id")
    .notNull()
    .references(() => datatableTables.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().$type<ColumnType>(),
  options: text("options", { mode: "json" }).$type<string[] | null>(),
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type DatatableColumn = typeof datatableColumns.$inferSelect;
export type NewDatatableColumn = typeof datatableColumns.$inferInsert;

export const datatableRows = sqliteTable("datatable_rows", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tableId: text("table_id")
    .notNull()
    .references(() => datatableTables.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type DatatableRow = typeof datatableRows.$inferSelect;
export type NewDatatableRow = typeof datatableRows.$inferInsert;

// ─── Sites ────────────────────────────────────────────────────────────────────

export const sites = sqliteTable("sites", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isPublished: integer("is_published", { mode: "boolean" }).notNull().default(false),
  publicPassword: text("public_password"),
  depsStatus: text("deps_status").notNull().default("ready"),
  depsError: text("deps_error"),
  draftDepsStatus: text("draft_deps_status").notNull().default("ready"),
  draftDepsError: text("draft_deps_error"),
  draftUpdatedAt: integer("draft_updated_at", { mode: "timestamp" }),
  createdBy: text("created_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;

// ─── Jobs (global cron + Bun/TS scripts) ──────────────────────────────────────

export const JOB_RUN_STATUSES = ["running", "success", "failed"] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

export const JOB_RUN_TRIGGERS = ["cron", "manual"] as const;
export type JobRunTrigger = (typeof JOB_RUN_TRIGGERS)[number];

export const jobs = sqliteTable("jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  code: text("code").notNull().default(""),
  draftCode: text("draft_code"),
  cron: text("cron").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  timeoutMs: integer("timeout_ms").notNull().default(300_000),
  nextRunAt: integer("next_run_at", { mode: "timestamp" }),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  leaseOwner: text("lease_owner"),
  leaseUntil: integer("lease_until", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;

export const jobRuns = sqliteTable("job_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  status: text("status").notNull().$type<JobRunStatus>().default("running"),
  trigger: text("trigger").notNull().$type<JobRunTrigger>().default("cron"),
  logs: text("logs").notNull().default(""),
  error: text("error"),
  instanceId: text("instance_id"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
});

export type JobRun = typeof jobRuns.$inferSelect;
export type NewJobRun = typeof jobRuns.$inferInsert;

// ─── Skills (shared catalog) ──────────────────────────────────────────────────
// Progressive disclosure: name+description in system prompt; body/references via read_skill.

export const skills = sqliteTable("skills", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  content: text("content").notNull().default(""),
  /** AI draft — written by edit_skill_file. null = no pending draft. */
  draftContent: text("draft_content"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;

export const skillReferences = sqliteTable("skill_references", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  skillId: text("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // slug within skill
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  /** AI draft — written by edit_skill_file. null = no pending draft. */
  draftContent: text("draft_content"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type SkillReference = typeof skillReferences.$inferSelect;
export type NewSkillReference = typeof skillReferences.$inferInsert;

export const agentSkillAssignments = sqliteTable("agent_skill_assignments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  skillId: text("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type AgentSkillAssignment = typeof agentSkillAssignments.$inferSelect;
export type NewAgentSkillAssignment = typeof agentSkillAssignments.$inferInsert;

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const apiKeys = sqliteTable("api_keys", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  agentsUnrestricted: integer("agents_unrestricted", { mode: "boolean" }).notNull().default(false),
  datatablesUnrestricted: integer("datatables_unrestricted", { mode: "boolean" }).notNull().default(false),
  kvUnrestricted: integer("kv_unrestricted", { mode: "boolean" }).notNull().default(false),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export const apiKeyAgents = sqliteTable(
  "api_key_agents",
  {
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.apiKeyId, t.agentId] })],
);

export type ApiKeyAgent = typeof apiKeyAgents.$inferSelect;

export const apiKeyDatatableProjects = sqliteTable(
  "api_key_datatable_projects",
  {
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => datatableProjects.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.apiKeyId, t.projectId] })],
);

export type ApiKeyDatatableProject = typeof apiKeyDatatableProjects.$inferSelect;

export const apiKeyKvEntries = sqliteTable(
  "api_key_kv_entries",
  {
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    kvEntryId: text("kv_entry_id")
      .notNull()
      .references(() => kvStore.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.apiKeyId, t.kvEntryId] })],
);

export type ApiKeyKvEntry = typeof apiKeyKvEntries.$inferSelect;

// ─── My MCP servers (we serve tools to Cursor / Claude Code) ──────────────────

export const myMcpServers = sqliteTable("my_mcp_servers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type MyMcpServer = typeof myMcpServers.$inferSelect;
export type NewMyMcpServer = typeof myMcpServers.$inferInsert;

export const myMcpServerTools = sqliteTable(
  "my_mcp_server_tools",
  {
    serverId: text("server_id")
      .notNull()
      .references(() => myMcpServers.id, { onDelete: "cascade" }),
    toolId: text("tool_id")
      .notNull()
      .references(() => agentTools.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.serverId, t.toolId] })],
);

export type MyMcpServerTool = typeof myMcpServerTools.$inferSelect;
