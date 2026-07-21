# Database migrations

## Rules

1. Use **Prisma Migrate** only (`prisma migrate dev` / `prisma migrate deploy`).
2. **Never** use `prisma db push`.
3. Migrations live under `apps/api/prisma/migrations/`.
4. Configure real CODEOWNERS for migration review when available.

## Assumptions (no production yet)

No production database has been deployed. Therefore:

- Scaffold migration `20260715000000_init_system_bootstrap` introduced `_system_bootstrap` only to allow Prisma client generation.
- Health/ready uses `SELECT 1` and does **not** need that table.
- Migration `20260715120000_org_store_warehouse_audit` **drops** `_system_bootstrap` and creates Organization / Store / Warehouse / AuditLog (+ partial unique index for default warehouse).
- We did **not** rewrite the historical bootstrap migration file; we advanced with a forward migration (safer once any environment has applied the first migration).

If you have a throwaway local DB still on bootstrap-only schema, run `pnpm db:migrate:deploy` (or `db:migrate`) to apply the forward migration.

## Current models

- `organizations`, `stores`, `warehouses`, `audit_logs`
- DB-enforced: unique `(organization_id, code)` on stores; unique `(store_id, code)` on warehouses; partial unique one default warehouse per store

## Commands

```bash
pnpm db:generate
pnpm db:migrate              # prefers DATABASE_MIGRATE_URL via scripts/prisma-with-migrate-url.mjs
pnpm db:migrate:deploy
pnpm prisma:validate
```

## Module ownership

Single Prisma schema file; **application code** may only touch owned tables (see data-ownership.md). Repositories must use `resolvePrismaClient` inside UnitOfWork.
