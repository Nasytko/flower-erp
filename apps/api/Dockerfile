# syntax=docker/dockerfile:1.7
# Production multi-stage build for @flower/api
# Uses pnpm deploy for a portable package with resolved runtime dependencies.
# Build context: monorepo root.

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

# Portable production bundle (prod deps only).
# dist/ is listed in .gitignore so pnpm deploy skips it — copy explicitly after deploy.
FROM build AS pruned
RUN pnpm --filter @flower/api --prod deploy /prod/api \
  && rm -rf /prod/api/dist \
  && cp -a /app/apps/api/dist /prod/api/dist \
  && cp -a /app/apps/api/prisma /prod/api/prisma \
  && cd /prod/api \
  && pnpm dlx prisma@$(node -p "require('./node_modules/@prisma/client/package.json').version") generate \
  && rm -rf /prod/api/src /prod/api/test /prod/api/.turbo \
    /prod/api/eslint.config.mjs /prod/api/tsconfig*.json /prod/api/nest-cli.json \
    /prod/api/Dockerfile /prod/api/*.tsbuildinfo \
  && test -f /prod/api/dist/main.js \
  && node -e "require('express'); require('@nestjs/core'); require('@prisma/client');"

# Migration bundle includes prisma CLI (devDependency) — deploy without --prod
FROM build AS migrate-bundle
RUN pnpm --filter @flower/api deploy /prod/migrate \
  && cp -a /app/apps/api/prisma /prod/migrate/prisma \
  && cd /prod/migrate \
  && pnpm exec prisma generate \
  && printf '%s\n' \
    '#!/bin/sh' \
    'set -eu' \
    'cd /app' \
    'if [ -n "${DATABASE_MIGRATE_URL:-}" ]; then' \
    '  export DATABASE_URL="$DATABASE_MIGRATE_URL"' \
    'fi' \
    'exec ./node_modules/.bin/prisma "$@"' \
    > /prod/migrate/docker-migrate-entrypoint.sh \
  && chmod +x /prod/migrate/docker-migrate-entrypoint.sh

FROM node:20-bookworm-slim AS migrate
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 flower \
  && useradd --system --uid 1001 --gid flower flower
COPY --from=migrate-bundle --chown=flower:flower /prod/migrate /app
USER flower
ENTRYPOINT ["/app/docker-migrate-entrypoint.sh"]
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
COPY --from=pruned --chown=flower:flower /prod/api /app
USER flower
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
