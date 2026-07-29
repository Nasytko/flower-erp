# Flower ERP — Stage E Final Audit Report

**Status:** `READY_FOR_SERVER_DRY_RUN`  
**Date:** 2026-07-29  
**Scope:** Pre-production cleanup audit after Stages A–C  
**Production migrations:** NOT applied

Related: [server-cleanup-plan.md](./server-cleanup-plan.md), [cleanup-stage-c-report.md](./cleanup-stage-c-report.md)

---

## 1. Executive summary

| Area | Result |
|------|--------|
| Runtime references to removed models | **Clean** — no dead Prisma reads/writes |
| Frontend dead code | **1 item removed** (`timelineMessageRu`) |
| Backend dead code | **Clean** — `replaceCompositionItems` is valid (actual composition, not removed entity) |
| Packages (api-client, permissions) | **Clean** |
| Docker build context | **Updated** `.dockerignore` |
| Deploy script | **Hardened** with Stage C gate, dry-run, cleanup |
| lint / typecheck / test / build | **Pass** |
| depcruise | 6 pre-existing violations (unchanged) |
| bash dry-run on dev host | **Not run** (no WSL/bash); run on VPS |

**Verdict:** Repository is ready for first production deploy dry-run on the server. Stage C migrations require explicit safety flags on first apply.

---

## 2. Removed-entity search — classification

### REQUIRED_MIGRATION_HISTORY (keep)

All references in `apps/api/prisma/migrations/**` for tables/enums created before Stage C drops. Not edited.

Includes: `order_timeline_events`, `sale_timeline_events`, `payment_timeline_events`, `delivery_timeline_events`, `transfer_timeline_events`, `reservation_movements`, `payment_allocation_transfers`, `order_composition_replacements`, `delivery_route_plans`, `GIFT_CERTIFICATE`, `TELEGRAM`, `delivery:manage-routes` (seed in `20260717000000`).

### REQUIRED_AUDIT_OR_BACKUP_SCRIPT (keep)

| File | References |
|------|------------|
| `scripts/audit-removable-data.sql` | All 10 dropped tables + enum checks |
| `scripts/backup-stage-c-tables.sh` | Table list + GIFT_CERTIFICATE/TELEGRAM report |
| `apps/api/prisma/migrations/20260729140000_*` | DROP statements |
| `apps/api/prisma/migrations/20260729150000_*` | Enum guards |

### REQUIRED_DOCUMENTATION (keep)

| File | Notes |
|------|-------|
| `docs/cleanup-audit.md` | Stage A inventory |
| `docs/database-cleanup-plan.md` | Stage C plan |
| `docs/cleanup-stage-b-report.md` | Stage B report |
| `docs/cleanup-stage-c-report.md` | Stage C report |
| `docs/architecture/**`, `docs/domain/**` | Historical ADRs — update opportunistically |
| `docs/architecture/adr/029-provider-neutral-geocoding-map-routing.md` | Mentions removed `ExternalNavigationLinkAdapter` in v1 context |

### Valid runtime (NOT removed entities)

| Symbol | Location | Reason |
|--------|----------|--------|
| `replaceCompositionItems` | `order.use-cases.ts`, `prisma-order.repository.ts` | Updates **actual composition** rows; not `OrderCompositionReplacement` table |
| `GIFT_CERTIFICATE` in `fancy-select.tsx` | Display heuristic for legacy payment methods | Safe until enum migration; no create UI |

### DEAD_RUNTIME_REFERENCE — removed in Stage E

| Item | Action |
|------|--------|
| `timelineMessageRu()` + `TIMELINE_MESSAGE_RU` | **Deleted** from `status-labels-ru.ts` (no consumers) |

### DEAD_RUNTIME_REFERENCE — already removed in Stages B/C

No matches in `apps/api/src`, `apps/backoffice`, `packages/*` for:

- `DeliveryRoutePlan`, `DeliveryRouteStop`, `PaymentAllocationTransfer`
- `*TimelineEvent` Prisma models
- `ReservationMovement`, `ROUTING_PORT`, `ExternalNavigationLinkAdapter`
- `replaceCompositionItem`, `allocateOrderPrepaymentsToSale`
- `delivery:manage-routes`

### DEAD_CONFIGURATION — fixed in Stage E

| Item | Action |
|------|--------|
| `delivery:manage-routes` in `docs/security/permission-matrix.md` | **Removed** |

### DEAD_TEST_REFERENCE

| File | Notes |
|------|-------|
| `reservation-invariants.integration.test.ts` | Asserts `reservation_movements` table absent — **valid** post-Stage C test |

---

## 3. Frontend audit (`apps/backoffice`)

### Kept intentionally (App Router)

| Route | Purpose |
|-------|---------|
| `/home` | Redirect → `/today` |
| `/operations` | Redirect → `/reports` |
| `/integrations` | Org-level geocoding settings (not in main nav) |
| `/organizations` | Store picker (technical entry) |

### No orphan pages found

Confirmed absent: `delivery-routes/*`, `sessions`, demo/playground routes.

### No dead components requiring deletion

Calendar, delivery board/map/calendar, today workspace — all imported and used.

### Removed

- `timelineMessageRu` export (dead)

---

## 4. Backend audit (`apps/api`)

### NestJS modules

All registered modules have active controllers. No orphan route-planning providers.

### Permissions

72 permissions in registry; `delivery:manage-routes` removed in Stage B.

### Seed

No Prisma seed file with dropped models.

---

## 5. Packages audit

| Package | Status |
|---------|--------|
| `@flower/api-client` | No timeline/route/transfer types |
| `@flower/permissions` | No `manage-routes` |
| `@flower/contracts` | No dropped DTOs |

No unused npm dependencies removed (none identified with multi-source verification).

---

## 6. Junk / empty directories

| Item | Action |
|------|--------|
| `backups/` | Gitignored — OK |
| `*.tsbuildinfo` | Gitignored |
| Empty `delivery-routes/` dirs | Removed in Stage B |
| `.DS_Store` / `Thumbs.db` | Gitignored |

No committed `.env` or dump files found.

---

## 7. Docker build context

### `.dockerignore` updates

Added explicit exclusions: `.git`, `.github`, `backups`, `coverage`, `*.log`, `*.dump`, test artifacts.

Secrets: `.env` / `.env.*` excluded from image; production uses Compose `env_file` — **correct**.

### Compose services (production)

| Service | Role |
|---------|------|
| `api` | NestJS API |
| `backoffice` | Next.js |
| `migrate` | One-shot Prisma (`profile: migrate`) |

No Redis/RabbitMQ/workers. External Postgres via `leadflow-db` network.

---

## 8. Deploy script changes (`deploy/scripts/deploy.sh`)

| Feature | Status |
|---------|--------|
| `set -Eeuo pipefail` | ✅ |
| Prerequisites (docker, compose v2, env, disk) | ✅ |
| Git dirty tracked files → fail | ✅ |
| Untracked → warn only | ✅ |
| `git clean -nd` diagnostic | ✅ |
| Build before stop | ✅ |
| `RUN_STAGE_C_AUDIT=1` | ✅ |
| `RUN_STAGE_C_BACKUP=1` | ✅ |
| `ALLOW_DESTRUCTIVE_MIGRATIONS=1` gate | ✅ |
| `DRY_RUN=1` | ✅ |
| `--remove-orphans` | ✅ |
| Post-success `cleanup_after_successful_deploy` | ✅ |
| `SKIP_DOCKER_CLEANUP=1` | ✅ |
| Rollback hints on error | ✅ |

Forbidden commands: **not present**.

---

## 9. Verification results

| Check | Result |
|-------|--------|
| `pnpm lint` | ✅ Pass |
| `pnpm typecheck` | ✅ Pass |
| `pnpm test` | ✅ 84 pass, 59 skipped (integration/e2e need DB) |
| `prisma validate` | ✅ Pass |
| `pnpm --filter @flower/api build` | ✅ Pass |
| `pnpm --filter @flower/backoffice build` | ✅ Pass |
| `pnpm depcruise` | ⚠️ 6 pre-existing errors |
| `bash -n deploy.sh` | ⏭️ Run on Linux VPS (no WSL locally) |
| `DRY_RUN=1 ./deploy/scripts/deploy.sh` | ⏭️ Run on VPS with Docker + `.env.production` |

---

## 10. Known risks

1. **First Stage C deploy** requires `RUN_STAGE_C_AUDIT=1 RUN_STAGE_C_BACKUP=1 ALLOW_DESTRUCTIVE_MIGRATIONS=1`.
2. **Enum migration** aborts if `GIFT_CERTIFICATE` or `TELEGRAM` rows exist in DB.
3. **Historical docs** (`docs/domain/*`, ADRs) still mention removed models — informational only.
4. **Legacy Dockerfiles** at `docker/api`, `docker/backoffice` — dev/CI only; production uses `apps/*/Dockerfile`.
5. **depcruise** domain→Prisma violations — pre-existing, not Stage E scope.

---

## 11. Server deployment checklist

```bash
cd /opt/flower-erp
git pull

# 1. Dry run
DRY_RUN=1 ./deploy/scripts/deploy.sh

# 2. First deploy after Stage C
RUN_STAGE_C_AUDIT=1 \
RUN_STAGE_C_BACKUP=1 \
ALLOW_DESTRUCTIVE_MIGRATIONS=1 \
  ./deploy/scripts/deploy.sh

# 3. Subsequent deploys
./deploy/scripts/deploy.sh
```

See [server-cleanup-plan.md](./server-cleanup-plan.md) for cleanup/rollback details.

---

## 12. Files changed in Stage E

| File | Change |
|------|--------|
| `deploy/scripts/deploy.sh` | Full hardening |
| `.dockerignore` | Expanded exclusions |
| `apps/backoffice/src/lib/status-labels-ru.ts` | Remove dead timeline helper |
| `docs/security/permission-matrix.md` | Remove manage-routes |
| `docs/server-cleanup-plan.md` | **New** |
| `docs/cleanup-stage-e-final-audit.md` | **New** (this file) |

---

## Final status

### `READY_FOR_SERVER_DRY_RUN`

Proceed with `DRY_RUN=1 ./deploy/scripts/deploy.sh` on the production VPS before live deploy.
