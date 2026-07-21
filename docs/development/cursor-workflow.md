# Cursor / agent workflow

## Before coding

1. Read `docs/architecture/overview.md` and relevant ADRs.
2. Read the domain flow for the vertical you touch (`docs/domain/*`).
3. Do not invent modules that conflict with `module-map.md`.

## Task sizing

- One task = one vertical slice (or one infrastructure concern).
- Do not mix supply posting with POS UI in the same change set.

## Hard rules for agents

- Do **not** change ADR / architecture docs without an explicit user decision.
- Do **not** put business logic in `apps/backoffice`.
- Do **not** import Prisma / `@prisma/client` from `domain/` or `application/` layers.
- Do **not** create God repositories that span module tables.
- Do **not** add Redis, queues, Kafka, S3, Telegram, AI, or storefront in v1.
- Do **not** use `prisma db push`.
- Do **not** implement auth until the auth vertical is requested.
- Do **not** create CRM module.

## After a task

Run from repo root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Fix failures before handing off. Do not claim stubs are production-complete business features.
