import { existsSync } from "node:fs";
import { builtinModules } from "node:module";

const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/** npm package name from an import specifier, or null for relative / builtin / platform modules. */
export function packageNameFromSpecifier(spec: string): string | null {
  const trimmed = spec.trim();
  if (!trimmed || trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.startsWith("node:") || trimmed.startsWith("bun:")) return null;
  if (trimmed === "nonlaagents" || trimmed === "@nonla-agents/runtime") return null;
  if (trimmed.startsWith("@")) {
    const [scope, name] = trimmed.split("/");
    if (!scope || !name) return null;
    return `${scope}/${name}`;
  }
  const base = trimmed.split("/")[0] ?? "";
  if (!base || NODE_BUILTINS.has(base)) return null;
  return base;
}

/**
 * Scan source for third-party packages to `bun add`.
 * Optional `// bun: pkg` comments override/extend when the npm name differs from the import path.
 */
export function detectPackages(code: string): string[] {
  const pkgs = new Set<string>();
  const bunOverrides = new Set<string>();

  for (const line of code.split("\n")) {
    const t = line.trim();

    const standalone = t.match(/^\/\/\s*bun:\s*(.+)/i);
    if (standalone) {
      for (const p of standalone[1].split(/[\s,]+/).filter(Boolean)) bunOverrides.add(p);
      continue;
    }

    const inline = t.match(/\/\/\s*bun:\s*(.+)/i);
    if (inline) {
      for (const p of inline[1].split(/[\s,]+/).filter(Boolean)) bunOverrides.add(p);
    }

    const codePart = t.replace(/\/\/.*$/, "").trim();
    for (const match of codePart.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
      const name = packageNameFromSpecifier(match[1] ?? "");
      if (name) pkgs.add(name);
    }
  }

  if (bunOverrides.size > 0) {
    for (const p of pkgs) bunOverrides.add(p);
    return [...bunOverrides];
  }
  return [...pkgs];
}

export function isPkgInstalled(dir: string, pkg: string): boolean {
  return existsSync(`${dir}/node_modules/${pkg}/package.json`);
}
