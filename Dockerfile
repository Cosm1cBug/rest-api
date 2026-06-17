# syntax=docker/dockerfile:1.7

# ─── deps stage: install ONLY production dependencies ────────────────
# Used only as a (potential) fallback if standalone tracing ever misses
# something — currently unused by the runtime stage but kept around as
# a cheap layer cache.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json .npmrc* ./
RUN npm ci --omit=dev --ignore-scripts

# ─── build stage: install full deps + build with output:standalone ───
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json .npmrc* ./
RUN npm ci --ignore-scripts
COPY . .
# next.config.mjs has output: 'standalone'. The build emits a
# self-contained server at .next/standalone/ that bundles only the
# node_modules entries the file tracer proved necessary.
RUN npm run build

# ─── runtime stage: minimal, non-root, only standalone output ───────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

# Create an unprivileged user. Running as root in containers is the
# single most common container-escape amplifier.
RUN addgroup -S app && adduser -S app -G app

# Copy ONLY the standalone server + the assets Next can't trace by
# default (the static client bundles and the public directory). This
# is the V15 image-size win: no full node_modules copy, no source tree.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static     ./.next/static
COPY --from=build --chown=app:app /app/public           ./public

# tmp/ is used by the uploads endpoint; create it now so the non-root
# user can write to it later.
RUN mkdir -p tmp && chown -R app:app /app/tmp

USER app

EXPOSE 3000

# Health check — uses the public /api/health endpoint (no auth needed).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

# next.config.mjs output:'standalone' produces a server.js at the root
# of .next/standalone/ (which we copied to /app above). It does NOT use
# `npm start` — that's the old non-standalone entrypoint.
CMD ["node", "server.js"]
