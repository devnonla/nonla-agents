/** Env vars a sandboxed `bun <script>` child needs to start and resolve modules. */
export const SANDBOX_ENV_ALLOWLIST = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TMP", "TEMP", "BUN_INSTALL", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy", "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS"] as const;

/**
 * Copy only the allowlisted host env into a child process, then apply `extra`.
 * Never forwards JWT secrets, provider keys, or the rest of the host environment.
 */
export function sandboxChildEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of SANDBOX_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return { ...env, ...extra };
}
