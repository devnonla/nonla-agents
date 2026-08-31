# ─────────────────────────────────────────────────────────────────────────────
# Nonla Agents — Production Docker Image
#
# Multi-stage build using Bun runtime.
#
# Build:
#   docker build -t devnonla/nonla-agents:latest .
#   docker build --build-arg BUILD_ID=$(git rev-parse --short HEAD) -t devnonla/nonla-agents:latest .
#
# Run:
#   docker run -d -p 15888:15888 \
#     -v nonla-agents-data:/data \
#     devnonla/nonla-agents:latest
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ──────────────────────────────────────────
FROM oven/bun:1 AS deps

WORKDIR /app

# Copy package manifests first (layer caching for deps)
COPY package.json bun.lock ./
COPY src/server/package.json src/server/
COPY src/web/package.json src/web/

# Install all dependencies (including devDependencies for build)
# Use BuildKit cache mount to persist bun's download cache across builds
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ── Stage 2: Build ─────────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app

# Optional: docker build --build-arg BUILD_ID=$(git rev-parse --short HEAD)
# When unset, Vite generates a fresh random id per build.
ARG BUILD_ID=
ENV BUILD_ID=$BUILD_ID

# Copy source code
COPY src/ src/
COPY biome.json ./

# Build web (Vite) → src/web/dist (+ build-meta.json with buildId)
RUN cd src/web && bun run build

# Build server (Bun bundle) → src/server/dist/index.js + sites-backend-worker.js
RUN cd src/server && bun run build

# ── Stage 3: Runtime base (cache apt-get layer) ───────────────────────────
FROM oven/bun:1-debian AS runtime-base

# Install bubblewrap to sandbox custom tools and site backend.ts workers
# (src/server/src/common/sandbox/) — needs `security_opt: [seccomp:unconfined]`
# at runtime, see docker-compose.yml.
# This layer is cached separately so it doesn't re-run on code changes
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      bubblewrap \
    && rm -rf /var/lib/apt/lists/*

# ── Stage 4: Production ───────────────────────────────────────────────────
FROM runtime-base

WORKDIR /app

# Copy package manifests and install production deps only
# Workspace deps (cloakbrowser, playwright-core) land in src/server/node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/src/server/package.json ./src/server/
COPY --from=builder /app/src/web/package.json ./src/web/
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --production --frozen-lockfile

# Server bundle under src/server/dist so Bun resolves --external packages
# from src/server/node_modules (cloakbrowser is not hoisted to root)
COPY --from=builder /app/src/server/dist ./src/server/dist

# SQL migrations: bundled index.js resolves via import.meta.url → …/dist/migrations
COPY --from=builder /app/src/server/src/common/db/migrations ./src/server/dist/migrations

# OG fonts: bundled index.js resolves via import.meta.dir → …/dist/og-fonts
COPY --from=builder /app/src/server/src/common/og-fonts ./src/server/dist/og-fonts

# Web UI: app.ts looks for join(__dirname, "../public") → src/server/public
COPY --from=builder /app/src/web/dist ./src/server/public

# CloakBrowser: Chromium system libs + pre-download stealth binary (builtin browser tool)
ENV CLOAKBROWSER_CACHE_DIR=/root/.cloakbrowser
RUN cd src/server && \
    bunx --bun playwright-core install-deps chromium && \
    bunx --bun cloakbrowser install && \
    bun -e "import { launch } from 'cloakbrowser'; const b = await launch({ headless: true, humanize: true }); const p = await b.newPage(); await p.goto('about:blank'); await b.close(); console.log('cloakbrowser smoke ok');"

# Create data directory
RUN mkdir -p /data

# ── Environment ─────────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=15888
ENV DATA_DIR=/data

EXPOSE 15888

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:15888/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Data volume
VOLUME ["/data"]

CMD ["bun", "run", "src/server/dist/index.js"]
