# syntax=docker/dockerfile:1.7
# Production multi-stage build for @flower/api (pnpm monorepo).
# Builds a self-contained deploy directory via `pnpm deploy` with hoisted
# node_modules so the final image has no broken pnpm symlinks.
# Build context: monorepo root.

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Must match package.json "packageManager" — corepack otherwise may fetch pnpm 11+ (requires Node 22.13+).
ARG PNPM_VERSION=9.15.0
# Prefer classic flat node_modules in deploy output (portable across COPY stages).
RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates findutils \
  && rm -rf /var/lib/apt/lists/* \
  && printf '%s\n' \
    'node-linker=hoisted' \
    'shamefully-hoist=false' \
    > /root/.npmrc

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY scripts/prisma-with-migrate-url.mjs ./scripts/prisma-with-migrate-url.mjs
# Full install for build (workspace linker fine here).
RUN printf '%s\n' 'node-linker=isolated' > .npmrc \
  && pnpm install --frozen-lockfile --filter @flower/api...

FROM deps AS build
RUN pnpm --filter @flower/api... build \
  && test -f /app/apps/api/dist/main.js
RUN pnpm --filter @flower/api db:generate

# ---------------------------------------------------------------------------
# pruned — portable production bundle (runtime deps only)
# ---------------------------------------------------------------------------
FROM build AS pruned
# Deploy with hoisted linker so /prod/api/node_modules contains real packages
# (express, @nestjs/*, workspace packages, @prisma/client, …).
RUN printf '%s\n' 'node-linker=hoisted' > /app/.npmrc \
  && pnpm --filter @flower/api --prod deploy /prod/api \
  && rm -rf /prod/api/dist \
  && cp -a /app/apps/api/dist /prod/api/dist \
  && cp -a /app/apps/api/prisma /prod/api/prisma \
  && cd /prod/api \
  && pnpm dlx prisma@$(node -p "require('./node_modules/@prisma/client/package.json').version") generate \
  && rm -rf /prod/api/src /prod/api/test /prod/api/.turbo \
    /prod/api/eslint.config.mjs /prod/api/tsconfig*.json /prod/api/nest-cli.json \
    /prod/api/Dockerfile /prod/api/*.tsbuildinfo /prod/api/.npmrc \
  && test -f /prod/api/dist/main.js \
  && test -d /prod/api/node_modules/express \
  && test -d /prod/api/node_modules/@nestjs/core \
  && test -d /prod/api/node_modules/@nestjs/platform-express \
  && test -d /prod/api/node_modules/@prisma/client \
  && node -e "require('express'); require('@nestjs/core'); require('@nestjs/common'); require('@nestjs/platform-express'); require('reflect-metadata'); require('rxjs'); require('@prisma/client'); console.log('runtime deps ok')" \
  && if [ -n "$(find /prod/api -xtype l -print)" ]; then \
       echo 'ERROR: broken symlinks in production bundle:' >&2; \
       find /prod/api -xtype l -print >&2; \
       exit 1; \
     fi

# ---------------------------------------------------------------------------
# migrate-bundle — production deps + Prisma CLI + schema/migrations
# ---------------------------------------------------------------------------
FROM build AS migrate-bundle
RUN printf '%s\n' 'node-linker=hoisted' > /app/.npmrc \
  && pnpm --filter @flower/api deploy /prod/migrate \
  && cp -a /app/apps/api/prisma /prod/migrate/prisma \
  && cd /prod/migrate \
  && pnpm exec prisma generate \
  && test -f /prod/migrate/node_modules/.bin/prisma \
  && test -f /prod/migrate/prisma/schema.prisma \
  && test -d /prod/migrate/prisma/migrations \
  && test -d /prod/migrate/node_modules/express \
  && node -e "require('express'); require('@prisma/client'); console.log('migrate runtime deps ok')" \
  && printf '%s\n' \
    '#!/bin/sh' \
    'set -eu' \
    'cd /app' \
    'if [ -n "${DATABASE_MIGRATE_URL:-}" ]; then' \
    '  export DATABASE_URL="$DATABASE_MIGRATE_URL"' \
    'fi' \
    'exec ./node_modules/.bin/prisma "$@"' \
    > /prod/migrate/docker-migrate-entrypoint.sh \
  && chmod +x /prod/migrate/docker-migrate-entrypoint.sh \
  && rm -rf /prod/migrate/src /prod/migrate/test /prod/migrate/.turbo \
    /prod/migrate/eslint.config.mjs /prod/migrate/tsconfig*.json \
    /prod/migrate/nest-cli.json /prod/migrate/Dockerfile /prod/migrate/*.tsbuildinfo \
  && if [ -n "$(find /prod/migrate -xtype l -print)" ]; then \
       echo 'ERROR: broken symlinks in migrate bundle:' >&2; \
       find /prod/migrate -xtype l -print >&2; \
       exit 1; \
     fi

FROM node:22-bookworm-slim AS migrate
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

FROM node:22-bookworm-slim AS production
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
# Layout after pnpm deploy: /app/dist/main.js (not /app/apps/api/dist/main.js)
CMD ["node", "dist/main.js"]
