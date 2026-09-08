/**
 * MCP URL checks — http(s) only. Local and private hosts are allowed.
 */

export async function assertSafeMcpUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid MCP server URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("MCP server URL must use http or https");
  }
}
