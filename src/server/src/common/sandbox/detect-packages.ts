import { existsSync } from "node:fs";
import { builtinModules } from "node:module";

const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/** Unscoped or @scope/name — rejects interpolations like `${raw}` that bun add cannot parse. */
const NPM_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/i;

function isNpmPackageName(name: string): boolean {
  return name.length > 0 && name.length <= 214 && NPM_PACKAGE_NAME.test(name);
}

/** Drop optional @version / @tag (`sharp@0.33.0`, `@scope/pkg@1`). */
function stripNpmVersion(spec: string): string {
  const s = spec.trim();
  if (s.startsWith("@")) {
    const slash = s.indexOf("/");
    if (slash < 0) return s;
    const rest = s.slice(slash + 1);
    const at = rest.indexOf("@");
    return at < 0 ? s : s.slice(0, slash + 1 + at);
  }
  const at = s.indexOf("@");
  return at < 0 ? s : s.slice(0, at);
}

/** npm package name from an import specifier, or null for relative / builtin / platform modules. */
export function packageNameFromSpecifier(spec: string): string | null {
  const trimmed = spec.trim();
  if (!trimmed || trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.startsWith("node:") || trimmed.startsWith("bun:")) return null;
  if (trimmed === "nonlaagents" || trimmed === "@nonla-agents/runtime") return null;
  if (trimmed.startsWith("@")) {
    const [scope, name] = trimmed.split("/");
    if (!scope || !name) return null;
    const pkg = `${scope}/${name}`;
    return isNpmPackageName(pkg) ? pkg : null;
  }
  const base = trimmed.split("/")[0] ?? "";
  if (!base || NODE_BUILTINS.has(base)) return null;
  return isNpmPackageName(base) ? base : null;
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
      for (const p of standalone[1].split(/[\s,]+/).filter(Boolean)) {
        const name = packageNameFromSpecifier(stripNpmVersion(p));
        if (name) bunOverrides.add(name);
      }
      continue;
    }

    const inline = t.match(/\/\/\s*bun:\s*(.+)/i);
    if (inline) {
      for (const p of inline[1].split(/[\s,]+/).filter(Boolean)) {
        const name = packageNameFromSpecifier(stripNpmVersion(p));
        if (name) bunOverrides.add(name);
      }
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
