# syntax=docker/dockerfile:1.7
# CI path — mirrors apps/api/Dockerfile production packaging (pnpm deploy + hoisted).

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ARG PNPM_VERSION=9.15.0
RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates findutils \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN printf '%s\n' 'node-linker=isolated' > .npmrc \
  && pnpm install --frozen-lockfile --filter @flower/api...

FROM deps AS build
RUN pnpm --filter @flower/api... build \
  && test -f /app/apps/api/dist/main.js
RUN pnpm --filter @flower/api db:generate

FROM build AS pruned
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
  && test -f /prod/api/dist/scripts/create-initial-director.js \
  && test -d /prod/api/node_modules/express \
  && node -e "require('express'); require('@nestjs/core'); require('@prisma/client');" \
  && if [ -n "$(find /prod/api -xtype l -print)" ]; then \
       echo 'ERROR: broken symlinks:' >&2; find /prod/api -xtype l -print >&2; exit 1; \
     fi

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 flower \
  && useradd --system --uid 1001 --gid flower flower
COPY --from=pruned --chown=flower:flower /prod/api /app
USER flower
EXPOSE 3001
CMD ["node", "dist/main.js"]
