# syntax=docker/dockerfile:1.7
# Production multi-stage build for @flower/api
# Build context: monorepo root (../.. from apps/api, or repo root in compose)

FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY scripts/prisma-with-migrate-url.mjs ./scripts/prisma-with-migrate-url.mjs
RUN pnpm install --frozen-lockfile --filter @flower/api...

FROM deps AS build
RUN pnpm --filter @flower/api... build
RUN pnpm --filter @flower/api db:generate

# One-shot migration job image (run before app rollout)
FROM build AS migrate
WORKDIR /app
ENV NODE_ENV=production
USER root
RUN groupadd --system --gid 1001 flower \
  && useradd --system --uid 1001 --gid flower flower \
  && chown -R flower:flower /app
USER flower
ENTRYPOINT ["node", "scripts/prisma-with-migrate-url.mjs"]
CMD ["migrate", "deploy"]

FROM node:20-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 flower \
  && useradd --system --uid 1001 --gid flower flower
COPY --from=build --chown=flower:flower /app /app
USER flower
EXPOSE 4000
WORKDIR /app/apps/api
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
