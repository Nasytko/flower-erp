# Flower ERP

Modular monolith for flower retail operations: organization, master data, supply → inventory, identity/auth, customer orders & composition, sales & stock issue, payments, florist workspace, delivery, and inventory operations (write-offs, transfers, counts).

## Status

Active development. Core bounded contexts and Prisma migrations are in the repository. Production deployment files exist under `deploy/` and `docker-compose.production.yml`. Local Docker/PostgreSQL and green CI `postgres-integration` should be verified before treating a VPS install as production-ready.

## Stack

| Layer | Choice |
|-------|--------|
| Monorepo | pnpm workspaces + Turborepo |
| API | NestJS (`apps/api`), REST `/api/v1` |
| Backoffice | Next.js App Router (`apps/backoffice`) |
| DB | PostgreSQL + Prisma Migrate |
| Shared | `@flower/contracts`, `@flower/shared-kernel`, `@flower/config`, `@flower/permissions`, … |

**Not in v1 (ADR-007):** Redis, message queues, Kafka, RabbitMQ, S3/object storage, Telegram bots, AI, public storefront.

## Requirements

- Node.js >= 20
- pnpm 9.15 (`corepack enable`)
- Docker (optional for local Postgres)

## Quick start

```bash
cp .env.example .env
# Edit .env locally — never commit real secrets
docker compose -f docker/docker-compose.dev.yml up -d postgres
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

- API: `http://localhost:3001/api/v1`
- Health: `GET /api/v1/health/live`, `GET /api/v1/health/ready`
- Backoffice: `http://localhost:3000`

## Environment

- Development template: [`.env.example`](./.env.example)
- Production template: [`.env.production.example`](./.env.production.example)
- Details: [docs/development/environment-variables.md](./docs/development/environment-variables.md)

**Never commit** `.env`, `.env.production`, JWT secrets, database passwords, or connection strings with real credentials. Only `*.example` env files belong in git.

## Project structure

```
apps/api              NestJS modular monolith + Prisma
apps/backoffice       Next.js staff UI
packages/*            Shared packages (@flower/*)
docs/                 ADRs, domain, development docs
docker/               Dev compose + legacy Dockerfiles
deploy/               Production deploy scripts, nginx snippet, README
docker-compose.production.yml
scripts/              Migrate / bootstrap helpers
```

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Run apps in watch mode |
| `pnpm build` | Build all packages/apps |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript checks |
| `pnpm test` | Unit/smoke tests (via turbo) |
| `pnpm db:generate` | Prisma client generate |
| `pnpm db:migrate` | Prisma migrate dev |
| `pnpm db:migrate:deploy` | Prisma migrate deploy |
| `pnpm depcruise` | Dependency cruise |

API package also has `test:unit`, `test:integration`, and `test:e2e` (integration/e2e need `DATABASE_URL` and a running PostgreSQL).

## Production deployment (shared VPS)

See **[deploy/README.md](./deploy/README.md)** for ORVIX-safe Docker Compose layout, localhost bindings, migrations, backup/restore, and reverse-proxy notes.

Intended public hostnames (configure in your own `.env.production`, not in git):

- Backoffice: `https://erp.nasytko.ru`
- API: `https://api-erp.nasytko.ru`

## Security

See [SECURITY.md](./SECURITY.md). Do not publish secrets to this public repository.

## Development docs

- [Local setup](./docs/development/local-setup.md)
- [Environment variables](./docs/development/environment-variables.md)
- [Migrations](./docs/development/database-migrations.md)
- [Testing](./docs/development/testing.md)
- [Architecture overview](./docs/architecture/overview.md)
