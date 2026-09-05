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
      // Exact package entry — do not prefix-match subpaths like styles.css
      {
        find: /^@nonla-agents\/ui$/,
        replacement: `${import.meta.dirname}/../nonla-ui/src/index.ts`,
      },
      {
        find: "@nonla-agents/ui/styles.css",
        replacement: `${import.meta.dirname}/../nonla-ui/src/styles.css`,
      },
      // "src/common/..." → packages/web/common/...
      { find: "src", replacement: import.meta.dirname },
    ],
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
          // Heavy editors / graphs (incl. @xyflow on agent flow / memory / schema) —
          // keep OUT of vendor-misc and do not force a shared named chunk (that can
          // swallow Vite's preload helper and cause the entry to statically import
          // monaco/mermaid/xyflow on first paint).
          if (
            id.includes("node_modules/monaco-editor") ||
            id.includes("node_modules/@monaco-editor") ||
            id.includes("node_modules/pixi.js") ||
            id.includes("node_modules/@pixi") ||
            id.includes("node_modules/mermaid") ||
            id.includes("node_modules/katex") ||
            id.includes("node_modules/cytoscape") ||
            id.includes("node_modules/dagre") ||
            id.includes("node_modules/@dagrejs") ||
            id.includes("node_modules/elkjs") ||
            id.includes("node_modules/framer-motion") ||
            id.includes("node_modules/@xyflow") ||
            id.includes("node_modules/.bun/@xyflow") ||
            id.includes("node_modules/@solar-icons") ||
            id.includes("node_modules/.bun/@solar-icons")
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
    open: true,
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
