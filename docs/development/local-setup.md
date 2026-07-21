# Flower ERP — Local setup

## Prerequisites

- Node.js >= 20
- pnpm 9.15.0 (via Corepack: `corepack enable`)
- Docker (optional, for local Postgres / compose)

## Steps

1. Clone the repository.
2. `cp .env.example .env` and adjust values.
3. Start Postgres (choose one):
   - `docker compose -f docker/docker-compose.dev.yml up -d postgres`
   - or your own local Postgres matching `DATABASE_URL`
4. `pnpm install`
5. `pnpm db:generate`
6. `pnpm db:migrate` (uses Prisma migrate; prefer `DATABASE_MIGRATE_URL`)
7. `pnpm --filter @flower/api dev`
8. `pnpm --filter @flower/backoffice dev`

Health checks:

- API live: `GET http://localhost:3001/api/v1/health/live`
- API ready: `GET http://localhost:3001/api/v1/health/ready`
- Backoffice dashboard shows API health panel

## Notes

- Do not use `prisma db push`.
- Redis, queues, S3, Telegram, AI, and storefront are intentionally absent (ADR-007).
- Auth is not implemented in the scaffold.
