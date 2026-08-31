import "monaco-editor/esm/vs/language/typescript/ts.worker.js";

globalThis.postMessage({ type: "vscode-worker-ready" });
