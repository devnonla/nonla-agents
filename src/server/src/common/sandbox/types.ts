export type SandboxWrapOpts = {
  cwd: string;
  /**
   * Absolute paths the child may write. Everything else is read-only.
   * Empty / omitted = no writes (site backends). Tool runs pass their sandbox dir.
   */
  writablePaths?: string[];
};
