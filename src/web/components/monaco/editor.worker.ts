import "monaco-editor/esm/vs/editor/editor.worker.js";

globalThis.postMessage({ type: "vscode-worker-ready" });
