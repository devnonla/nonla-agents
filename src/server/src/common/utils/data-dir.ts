/** App data directory (SQLite, tool envs, screenshots, …). */
export function getDataDir(): string {
  return process.env.DATA_DIR ?? `${process.env.HOME ?? "~"}/.nonla-agents`;
}

/** OS temp directory (Bun has no `os.tmpdir`). */
export function tmpDir(): string {
  return process.env.TMPDIR || process.env.TMP || process.env.TEMP || "/tmp";
}
