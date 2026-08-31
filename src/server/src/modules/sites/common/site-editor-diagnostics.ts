import * as ts from "typescript";
import { type SiteSourceFile, type SiteTree, readAllSourceFiles } from "../sites-fs.js";

const MAX_DIAGNOSTICS = 30;

export type SiteEditorDiagnostic = {
  file: SiteSourceFile;
  line: number;
  column: number;
  message: string;
};

const SITE_API_STUB = `export function loadSiteData(query?: Record<string, unknown>): Promise<any>;
export function siteAction(body?: any): Promise<any>;
export function peekSiteData(): any;
`;

const GLOBALS_STUB = `declare module "react" {
  export type ReactNode = any;
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prevState: S) => S);
  export type DependencyList = readonly any[];
  export function useState(initial?: any): [any, Dispatch<SetStateAction<any>>];
  export function useEffect(effect: () => void | (() => void), deps?: DependencyList): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: DependencyList): void;
  export function useMemo<T>(factory: () => T, deps?: DependencyList): T;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps?: DependencyList): T;
  export function useRef<T>(initial: T): { current: T };
  export function useRef<T>(initial: T | null): { current: T | null };
  export function useId(): string;
  export function useReducer<R extends (state: any, action: any) => any>(reducer: R, initialState: any): [any, (action: any) => void];
  export function useContext<T>(context: T): T;
  export function createContext<T>(defaultValue: T): T;
  export function createElement(type: any, props?: any, ...children: any[]): any;
  export function memo<T>(component: T): T;
  export function forwardRef<T, P = any>(render: any): any;
  export function lazy(factory: () => Promise<any>): any;
  export function startTransition(cb: () => void): void;
  export const Fragment: any;
  export const StrictMode: any;
  export const Suspense: any;
  export const Children: any;
  const React: {
    useState: typeof useState;
    useEffect: typeof useEffect;
    createElement: typeof createElement;
    Fragment: any;
    [key: string]: any;
  };
  export default React;
  export as namespace React;
  namespace JSX {
    type Element = any;
    interface IntrinsicElements { [elemName: string]: any }
    interface ElementChildrenAttribute { children: any }
  }
}

declare module "react/jsx-runtime" {
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
  export function jsxDEV(type: any, props: any, key?: any): any;
  export const Fragment: any;
}

declare module "react-dom/client" {
  export function createRoot(container: any): { render(node: any): void; unmount(): void };
}

declare module "react-dom" {
  export function createPortal(node: any, container: any): any;
}

declare namespace JSX {
  type Element = any;
  interface IntrinsicElements { [elemName: string]: any }
  interface ElementChildrenAttribute { children: any }
}

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  stdout: { write(chunk: string | Uint8Array): boolean };
  stderr: { write(chunk: string | Uint8Array): boolean };
};

declare const Bun: any;
`;

const VIRTUAL_FILES: Record<string, SiteSourceFile> = {
  "/app.tsx": "app.tsx",
  "/backend.ts": "backend.ts",
};

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  allowJs: true,
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noEmit: true,
  noImplicitAny: false,
  strict: false,
  strictNullChecks: false,
  // NOTE: the Program API (unlike tsconfig.json) expects full lib file names,
  // not the short tsconfig aliases ("esnext"/"dom") — otherwise TS tries to
  // resolve literal files named "esnext"/"dom" and silently loads no lib,
  // producing bogus "Cannot find name 'String'" etc. on every file.
  lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
};

function virtualPath(fileName: string): string | undefined {
  const normalized = fileName.replace(/\\/g, "/");
  const base = normalized.split("/").pop();
  if (!base) return undefined;
  if (base === "app.tsx") return "/app.tsx";
  if (base === "backend.ts") return "/backend.ts";
  if (base === "site-api.js" || base === "site-api.d.ts") return "/site-api.js";
  if (base === "globals.d.ts") return "/globals.d.ts";
  return undefined;
}

function jsonErrorLocation(content: string, err: SyntaxError): { line: number; column: number } {
  const match = /position\s+(\d+)/i.exec(err.message);
  if (!match) return { line: 1, column: 1 };
  const pos = Number(match[1]);
  if (!Number.isFinite(pos) || pos < 0) return { line: 1, column: 1 };
  const until = content.slice(0, pos);
  const lines = until.split("\n");
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

/** TypeScript + JSON diagnostics for draft files, matching the Monaco editor environment. */
export function collectSiteEditorDiagnostics(siteId: string, tree: SiteTree = "draft"): SiteEditorDiagnostic[] {
  const files = readAllSourceFiles(siteId, tree);
  const out: SiteEditorDiagnostic[] = [];

  try {
    JSON.parse(files["package.json"] || "{}");
  } catch (err) {
    const loc = err instanceof SyntaxError ? jsonErrorLocation(files["package.json"] ?? "", err) : { line: 1, column: 1 };
    out.push({
      file: "package.json",
      line: loc.line,
      column: loc.column,
      message: (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").trim(),
    });
  }

  const virtual: Record<string, string> = {
    "/app.tsx": files["app.tsx"] || "export default function App() { return null; }\n",
    "/backend.ts": files["backend.ts"] || "export async function handle() { return {}; }\n",
    "/site-api.js": SITE_API_STUB,
    "/globals.d.ts": GLOBALS_STUB,
  };

  const host = ts.createCompilerHost(COMPILER_OPTIONS, true);
  const origExists = host.fileExists.bind(host);
  const origRead = host.readFile.bind(host);
  host.fileExists = (fileName) => virtualPath(fileName) !== undefined || origExists(fileName);
  host.readFile = (fileName) => {
    const key = virtualPath(fileName);
    if (key) return virtual[key];
    return origRead(fileName);
  };

  const program = ts.createProgram({
    rootNames: ["/app.tsx", "/backend.ts", "/globals.d.ts"],
    options: COMPILER_OPTIONS,
    host,
  });

  for (const diag of ts.getPreEmitDiagnostics(program)) {
    if (diag.category !== ts.DiagnosticCategory.Error) continue;
    const fileName = diag.file?.fileName;
    if (!fileName || !diag.file || diag.start == null) continue;
    const sourceFile = VIRTUAL_FILES[virtualPath(fileName) ?? ""];
    if (!sourceFile) continue;
    const pos = diag.file.getLineAndCharacterOfPosition(diag.start);
    const message = ts.flattenDiagnosticMessageText(diag.messageText, " ").replace(/\s+/g, " ").trim();
    if (!message) continue;
    out.push({
      file: sourceFile,
      line: pos.line + 1,
      column: pos.character + 1,
      message,
    });
    if (out.length >= MAX_DIAGNOSTICS) return out;
  }

  return out;
}
