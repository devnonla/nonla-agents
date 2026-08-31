export function slugifyMcpName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "mcp-server";
}

export function mcpEndpointUrl(serverId: string): string {
  return `${window.location.origin}/mcp/${serverId}`;
}

export function cursorMcpSnippet(name: string, url: string, token: string): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        [slugifyMcpName(name)]: {
          url,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  )}\n`;
}

export function claudeCodeMcpSnippet(name: string, url: string, token: string): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        [slugifyMcpName(name)]: {
          type: "http",
          url,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  )}\n`;
}
