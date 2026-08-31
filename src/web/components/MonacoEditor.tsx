import { useCallback, useRef } from "react";

import type { EditorProps, Monaco, DiffEditorProps as MonacoDiffEditorProps } from "@monaco-editor/react";
import MonacoReactEditor, { DiffEditor as MonacoReactDiffEditor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import type { editor as editorNS } from "monaco-editor";
// @ts-expect-error deep monaco language path has no types
import { conf as markdownConf, language as markdownLanguage } from "monaco-editor/esm/vs/basic-languages/markdown/markdown.js";
import EditorWorker from "src/components/monaco/editor.worker?worker";
import JsonWorker from "src/components/monaco/json.worker?worker";
import TsWorker from "src/components/monaco/ts.worker?worker";

type WorkerCtor = new (options?: { name?: string }) => Worker;

/** Wait until the worker module has installed onmessage, then let Monaco handshake. */
function workerWhenReady(WorkerCtor: WorkerCtor, label: string): Promise<Worker> {
  const worker = new WorkerCtor({ name: label });
  return new Promise((resolve, reject) => {
    const finish = (ok: boolean, err?: unknown) => {
      worker.removeEventListener("message", onMsg);
      worker.removeEventListener("error", onErr);
      if (ok) resolve(worker);
      else reject(err);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === "vscode-worker-ready") finish(true);
    };
    const onErr = (e: ErrorEvent) => finish(false, e.error ?? e);
    worker.addEventListener("message", onMsg);
    worker.addEventListener("error", onErr);
  });
}

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "json") return workerWhenReady(JsonWorker, label);
    if (label === "typescript" || label === "javascript") return workerWhenReady(TsWorker, label);
    return workerWhenReady(EditorWorker, label);
  },
};

loader.config({ monaco });

export type EditorInstance = editorNS.IStandaloneCodeEditor;
export type { Monaco };

const RAW_DARK_THEME = "raw-dark";
let rawDarkThemeRegistered = false;
let scriptDtsRegistered = false;
let markdownTokensRegistered = false;

function ensureMarkdownLanguage(monacoInstance: Monaco) {
  if (markdownTokensRegistered) return;
  markdownTokensRegistered = true;
  monacoInstance.languages.setMonarchTokensProvider("markdown", markdownLanguage);
  monacoInstance.languages.setLanguageConfiguration("markdown", markdownConf);
}

function ensureRawDarkTheme(monacoInstance: Monaco) {
  monacoInstance.editor.defineTheme(RAW_DARK_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword.md", foreground: "599ce7", fontStyle: "bold" },
      { token: "strong.md", foreground: "ebebeb", fontStyle: "bold" },
      { token: "emphasis.md", foreground: "8c8c8c", fontStyle: "italic" },
      { token: "comment.md", foreground: "636363", fontStyle: "italic" },
      { token: "string.md", foreground: "0ac864" },
      { token: "variable.md", foreground: "f1b467" },
      { token: "string.link.md", foreground: "599ce7" },
      { token: "variable.source.md", foreground: "8c8c8c" },
      { token: "meta.separator.md", foreground: "636363" },
      { token: "tag.md", foreground: "dd7627" },
      { token: "keyword.table.header.md", foreground: "599ce7", fontStyle: "bold" },
    ],
    colors: {
      "editor.lineHighlightBackground": "#ffffff0a",
      "editor.lineHighlightBorder": "#00000000",
      "editorOverviewRuler.border": "#00000000",
      "scrollbar.shadow": "#00000000",
      "diffEditor.insertedTextBackground": "#9bb95526",
      "diffEditor.removedTextBackground": "#ff000026",
      "diffEditor.insertedLineBackground": "#9bb95526",
      "diffEditor.removedLineBackground": "#ff000026",
    },
  });
  monacoInstance.editor.setTheme(RAW_DARK_THEME);
  if (!rawDarkThemeRegistered) {
    rawDarkThemeRegistered = true;
  }
}

function prepareMonaco(monacoInstance: Monaco) {
  ensureRawDarkTheme(monacoInstance);
  ensureMarkdownLanguage(monacoInstance);
  ensureScriptDts(monacoInstance);
}

const JOB_SCRIPT_DTS = `declare module "nonlaagents"{
  const nonlaagents: any;
  export default nonlaagents;
}

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  stdout: { write(chunk: string | Uint8Array): boolean };
  stderr: { write(chunk: string | Uint8Array): boolean };
};

declare const Bun: any;
`;

const REACT_SITE_DTS = `declare module "react" {
  export type ReactNode = any;
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prevState: S) => S);
  export type DependencyList = readonly any[];
  export function useState<S = any>(initial?: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
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
`;

const SITE_API_DTS = `export function loadSiteData(query?: Record<string, unknown>): Promise<any>;
export function siteAction(body?: any): Promise<any>;
export function peekSiteData(): any;
`;

function ensureScriptDts(monacoInstance: Monaco) {
  if (scriptDtsRegistered) return;
  scriptDtsRegistered = true;
  const ts = monacoInstance.languages.typescript;
  const compilerOptions = {
    ...ts.typescriptDefaults.getCompilerOptions(),
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    noEmit: true,
    skipLibCheck: true,
    noImplicitAny: false,
    strict: false,
    strictNullChecks: false,
    lib: ["esnext", "dom"],
  };
  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
  ts.javascriptDefaults.setCompilerOptions(compilerOptions);
  ts.typescriptDefaults.addExtraLib(JOB_SCRIPT_DTS, "ts:job-script.d.ts");
  ts.typescriptDefaults.addExtraLib(REACT_SITE_DTS, "ts:react-site.d.ts");
  ts.typescriptDefaults.addExtraLib(SITE_API_DTS, "file:///site-api.d.ts");
}

/** Monaco 0.55 treats extensionless models as JS when allowJs is on. */
function modelExtForLanguage(language: string | undefined): string {
  switch (language) {
    case "typescript":
      return ".ts";
    case "javascript":
      return ".js";
    case "json":
      return ".json";
    case "css":
      return ".css";
    case "html":
      return ".html";
    case "markdown":
      return ".md";
    default:
      return "";
  }
}

const DEFAULT_OPTIONS: editorNS.IStandaloneEditorConstructionOptions = {
  fontSize: 13,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  padding: { top: 10, bottom: 10 },
  tabSize: 2,
  wordWrap: "off",
  automaticLayout: true,
  scrollbar: {
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
    horizontal: "visible",
  },
  overviewRulerBorder: false,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  stickyScroll: { enabled: false },
  renderLineHighlight: "line",
  unicodeHighlight: {
    ambiguousCharacters: false,
    invisibleCharacters: false,
    nonBasicASCII: false,
  },
};

export interface MonacoEditorProps extends Omit<EditorProps, "loading" | "theme"> {
  theme?: string;
  height?: string | number;
  options?: editorNS.IStandaloneEditorConstructionOptions;
  onSave?: () => void;
}

let editorModelSeq = 0;

export function MonacoEditor({ theme = RAW_DARK_THEME, options, height = "100%", onSave, onMount, path, language, ...props }: MonacoEditorProps) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const idRef = useRef(`model-${++editorModelSeq}`);
  const resolvedPath = path ?? `file:///monaco/${idRef.current}${modelExtForLanguage(language)}`;

  const handleMount: EditorProps["onMount"] = useCallback(
    (editor: EditorInstance, monacoInstance: Monaco) => {
      prepareMonaco(monacoInstance);
      monacoInstance.editor.setTheme(theme);
      editor.updateOptions({
        unicodeHighlight: {
          ambiguousCharacters: false,
          invisibleCharacters: false,
          nonBasicASCII: false,
        },
      });
      editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
        onSaveRef.current?.();
      });
      onMount?.(editor, monacoInstance);
    },
    [onMount, theme],
  );

  return <MonacoReactEditor {...props} path={resolvedPath} language={language} height={height} theme={theme} options={{ ...DEFAULT_OPTIONS, ...options }} onMount={handleMount} beforeMount={prepareMonaco} />;
}

const DEFAULT_DIFF_OPTIONS: editorNS.IDiffEditorConstructionOptions = {
  fontSize: 13,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  padding: { top: 10, bottom: 10 },
  wordWrap: "off",
  automaticLayout: true,
  scrollbar: {
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
    horizontal: "visible",
  },
  overviewRulerBorder: false,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  stickyScroll: { enabled: false },
  readOnly: true,
  renderSideBySide: false,
  unicodeHighlight: {
    ambiguousCharacters: false,
    invisibleCharacters: false,
    nonBasicASCII: false,
  },
};

export interface DiffEditorComponentProps extends Omit<MonacoDiffEditorProps, "loading" | "theme"> {
  theme?: string;
  height?: string | number;
  options?: editorNS.IDiffEditorConstructionOptions;
}

let diffModelSeq = 0;

export function MonacoDiffEditor({ theme = RAW_DARK_THEME, options, height = "100%", onMount, originalModelPath, modifiedModelPath, language, ...props }: DiffEditorComponentProps) {
  const idRef = useRef(`diff-${++diffModelSeq}`);
  const ext = modelExtForLanguage(language);
  const handleMount: NonNullable<MonacoDiffEditorProps["onMount"]> = useCallback(
    (editor, monacoInstance) => {
      prepareMonaco(monacoInstance);
      monacoInstance.editor.setTheme(theme);

      const paint = () => {
        requestAnimationFrame(() => editor.layout());
      };
      const sub = editor.onDidUpdateDiff(paint);
      onMount?.(editor, monacoInstance);
      editor.onDidDispose(() => sub.dispose());
    },
    [onMount, theme],
  );

  return (
    <MonacoReactDiffEditor
      {...props}
      language={language}
      originalModelPath={originalModelPath ?? `inmemory://original/${idRef.current}${ext}`}
      modifiedModelPath={modifiedModelPath ?? `inmemory://modified/${idRef.current}${ext}`}
      height={height}
      theme={theme}
      options={{ ...DEFAULT_DIFF_OPTIONS, ...options }}
      onMount={handleMount}
      beforeMount={prepareMonaco}
    />
  );
}
