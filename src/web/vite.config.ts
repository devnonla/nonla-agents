import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";
import pkg from "../../package.json" with { type: "json" };

/** Prefer CI/Docker `--build-arg BUILD_ID=…`; otherwise a fresh id per build. */
function resolveBuildId(): string {
  const fromEnv = process.env.BUILD_ID?.trim();
  if (fromEnv) return fromEnv;
  return randomBytes(8).toString("hex");
}

const APP_BUILD_ID = resolveBuildId();
const apiPort = process.env.PORT ?? "8429";

function buildMetaPlugin(buildId: string, version: string): Plugin {
  return {
    name: "nonla-agents-build-meta",
    writeBundle(outputOptions) {
      const outDir = outputOptions.dir ?? `${import.meta.dirname}/dist`;
      writeFileSync(`${outDir}/build-meta.json`, `${JSON.stringify({ buildId, version }, null, 2)}\n`);
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
  },
  root: import.meta.dirname,
  plugins: [tailwindcss(), react(), buildMetaPlugin(APP_BUILD_ID, pkg.version)],
  resolve: {
    alias: [
      // "src/common/..." → packages/web/common/...
      { find: "src", replacement: import.meta.dirname },
    ],
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["highlight.js", "highlight.js/lib/common", "highlight.js/lib/core", "mermaid", "devnonla-ui"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: {
      input: `${import.meta.dirname}/index.html`,
      output: {
        manualChunks(id) {
          // Heavy editors (monaco / mermaid) —
          // keep OUT of vendor-misc and do not force a shared named chunk (that can
          // swallow Vite's preload helper and cause the entry to statically import
          // monaco/mermaid on first paint).
          if (
            id.includes("node_modules/monaco-editor") ||
            id.includes("node_modules/@monaco-editor") ||
            id.includes("node_modules/mermaid") ||
            id.includes("node_modules/katex") ||
            id.includes("node_modules/cytoscape") ||
            id.includes("node_modules/framer-motion") ||
            id.includes("@iconify-json/fluent-color") ||
            id.includes("@iconify-json+fluent-color")
          ) {
            return;
          }
          // Remaining node_modules (react, …) → one shared chunk
          // NOTE: do NOT split react/react-dom into a separate chunk — packages
          // in vendor-misc import react, creating a circular chunk dependency
          // that causes a runtime TypeError on the production build.
          if (id.includes("node_modules")) {
            return "vendor-misc";
          }
        },
      },
    },
  },
  server: {
    open: false,
    proxy: {
      // Proxy API calls to the Hono server during dev
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
      // Public site HTML + assets (Hono React sites — not the SPA shell)
      "/public/sites": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
      "/mcp/": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
      // Proxy WebSocket connections to the Hono server
      "/ws": {
        target: `ws://127.0.0.1:${apiPort}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
