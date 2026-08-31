import "monaco-editor/esm/vs/language/json/json.worker.js";

globalThis.postMessage({ type: "vscode-worker-ready" });
