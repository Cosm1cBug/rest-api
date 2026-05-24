# syntax=docker/dockerfile:1.7

# ---------- deps stage: install ONLY production dependencies ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# ---------- build stage: install full deps + build ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ---------- runtime stage: minimal, non-root ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

# Create an unprivileged user. Running as root in containers is the
# single most common container-escape amplifier.
RUN addgroup -S app && adduser -S app -G app

# Copy only what the runtime needs.
COPY --from=build  /app/.next         ./.next
COPY --from=build  /app/public        ./public
COPY --from=build  /app/package.json  ./package.json
COPY --from=deps   /app/node_modules  ./node_modules

# Make the workdir writeable by the non-root user (tmp/, etc.).
RUN mkdir -p tmp && chown -R app:app /app

USER app

EXPOSE 3000

# Health check — uses the public /api/health endpoint (no auth needed).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["npm", "start"]
