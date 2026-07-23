# syntax=docker/dockerfile:1.7
# Production multi-stage build for @flower/backoffice
# Build context: monorepo root

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ARG PNPM_VERSION=9.15.0
RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/backoffice ./apps/backoffice
RUN pnpm install --frozen-lockfile --filter @flower/backoffice...

FROM deps AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_BASE_URL=https://flower.example.com/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV DOCKER_BUILD=1
RUN pnpm --filter @flower/backoffice... build

FROM node:22-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN groupadd --system --gid 1001 flower \
  && useradd --system --uid 1001 --gid flower flower
COPY --from=build --chown=flower:flower /app/apps/backoffice/.next/standalone ./
COPY --from=build --chown=flower:flower /app/apps/backoffice/.next/static ./apps/backoffice/.next/static
COPY --from=build --chown=flower:flower /app/apps/backoffice/public ./apps/backoffice/public
USER flower
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/backoffice/server.js"]
