# Testing

## Commands

```bash
pnpm test                 # unit + integration + e2e (integration/e2e skip without DATABASE_URL)
pnpm --filter @flower/api test:unit
pnpm --filter @flower/api test:integration   # requires Postgres + migrated schema
pnpm --filter @flower/api test:e2e           # requires Postgres + migrated schema
pnpm --filter @flower/backoffice test:e2e    # Playwright (needs API+UI + AUTH_E2E=1)
```

## Layout

| Path | Purpose |
|------|---------|
| `apps/api/test/unit` | Domain rules (no DB) |
| `apps/api/test/integration` | UoW + supply/inventory/sales/payments/auth against Postgres |
| `apps/api/test/e2e` | HTTP API via Nest testing + supertest (incl. payments) |
| `apps/backoffice/e2e` | Playwright auth smoke |

Integration/e2e tests set `skip: !process.env.DATABASE_URL` (and respect `SKIP_INTEGRATION` / `SKIP_E2E`).

Payments coverage:

- Unit: `apps/api/src/modules/payments/domain/payment-rules.test.ts`
- Integration: `apps/api/test/integration/payments.integration.test.ts` (Postgres)
- E2E: `apps/api/test/e2e/payments.e2e.test.ts` (Postgres)

Workspace / ClaimNext (EPIC 10):

- Unit: `apps/api/test/unit/urgency.test.ts`, claim eligibility in `order-rules.test.ts`
- Integration: `apps/api/test/integration/workspace-claim.integration.test.ts` (concurrent claimNext; skip without `DATABASE_URL`)
- E2E: `apps/api/test/e2e/workspace.e2e.test.ts` (Today + Operations smoke)

Delivery (EPIC 11):

- Unit: `apps/api/src/modules/delivery/domain/delivery-rules.test.ts`, navigation link adapter test
- Integration: `apps/api/test/integration/delivery-flow.integration.test.ts` (create/duplicate/assign concurrent/deliver idempotent; skip without `DATABASE_URL`)
- E2E: `apps/api/test/e2e/delivery.e2e.test.ts` (create + board smoke)

Inventory Operations (EPIC 12):

- Unit: `apps/api/src/modules/inventory/domain/inventory-operations-rules.test.ts`
- Integration: `apps/api/test/integration/inventory-operations.integration.test.ts` and `apps/api/test/integration/transfers.integration.test.ts` (skip without `DATABASE_URL`)
- E2E: `apps/api/test/e2e/inventory-operations.e2e.test.ts` (API smoke; skip without `DATABASE_URL`)
- Backoffice Playwright smoke: inventory operations routes under `apps/backoffice/e2e`

## CI

1. Job `quality` — lint, typecheck, unit, build, depcruise (no Postgres required for unit).
2. Job `postgres-integration` — Postgres 16 service, `prisma generate`, `migrate deploy`, `validate`, integration + e2e.
3. Job `backoffice-playwright` — optional browser smoke against running API + backoffice when CI environment enables auth/bootstrap.

Auth bootstrap for tests uses `BootstrapOwnerUseCases` + `/auth/login`.

