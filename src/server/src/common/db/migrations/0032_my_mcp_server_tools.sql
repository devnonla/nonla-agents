CREATE TABLE IF NOT EXISTS my_mcp_server_tools (
  server_id TEXT NOT NULL REFERENCES my_mcp_servers(id) ON DELETE CASCADE,
  tool_id   TEXT NOT NULL REFERENCES agent_tools(id) ON DELETE CASCADE,
  PRIMARY KEY (server_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_my_mcp_server_tools_tool ON my_mcp_server_tools(tool_id);
