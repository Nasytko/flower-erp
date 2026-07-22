# syntax=docker/dockerfile:1.7
# CI / legacy path — mirrors apps/api/Dockerfile production packaging.

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
RUN pnpm install --frozen-lockfile --filter @flower/api...

FROM deps AS build
RUN pnpm --filter @flower/api... build
RUN pnpm --filter @flower/api db:generate

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

FROM node:20-bookworm-slim AS runner
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
