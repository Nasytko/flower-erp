# Flower ERP — production deploy runbook

Deploy Flower ERP on a shared VPS alongside ORVIX/LeadFlow without touching their databases, volumes, or ports.

## 1. Prerequisites

- Docker Engine + Compose V2
- Git checkout at `/opt/flower-erp`
- PostgreSQL database `flower_erp` on shared instance (`leadflow-postgres-1`)
- Reverse proxy on host (nginx) for TLS

## 2. First installation

```bash
cd /opt/flower-erp
git clone …   # or copy release
cp .env.production.example .env.production
# edit secrets in .env.production (never commit)

./deploy/scripts/init-production.sh
./deploy/scripts/deploy.sh
./deploy/scripts/bootstrap-first-organization.sh
```

After bootstrap:

1. Sign in at Backoffice using **login** (not email).
2. Set `ALLOW_OWNER_BOOTSTRAP=false` in `.env.production`.
3. Run `./deploy/scripts/deploy.sh` again.

## 3. Environment

Template: `.env.production.example`

Key variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | API runtime (flower_user) |
| `DATABASE_MIGRATE_URL` | Migrations (flower_migrate) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Auth |
| `NEXT_PUBLIC_API_BASE_URL` | Backoffice build-time API URL |
| `CORS_ORIGINS` | API CORS |
| `FLOWER_PG_ADMIN_USER` / `FLOWER_PG_ADMIN_DB` | LeadFlow admin (default `leadflow`) |

Secrets live only in `.env.production` on the server.

## 4. First database migration

Migrations run automatically in `deploy.sh`. Manual run:

```bash
./deploy/scripts/migrate.sh
```

## 5. Bootstrap first organization and director

Empty database after migrate:

```bash
./deploy/scripts/bootstrap-first-organization.sh
```

Creates organization, first store, warehouse, and DIRECTOR with `mustChangePassword=true`.

Add another director to existing organization:

```bash
./deploy/scripts/create-director-user.sh
```

Prefer `DIRECTOR_PASSWORD_FILE=/secure/path` over env password.

Development only (never production):

```bash
ALLOW_DEV_DATABASE_RESET=YES \
CONFIRM_RESET_TEST_DATABASE=YES \
CONFIRM_ALL_FLOWER_DATA_CAN_BE_DELETED=YES \
  ./deploy/scripts/dev/reset-test-database.sh
```

## 6. Normal deployment

```bash
cd /opt/flower-erp
git pull --ff-only
./deploy/scripts/deploy.sh
```

Optional: `DRY_RUN=1`, `SKIP_DOCKER_CLEANUP=1`.

Flow: build images → `prisma migrate deploy` → start api/backoffice → health checks.

## 7. Status

```bash
./deploy/scripts/status.sh
```

Shows git, disk, compose health, HTTP checks, migration status, latest backup (no secrets).

## 8. Backup

```bash
./deploy/scripts/backup-db.sh
```

Creates verified custom-format dump on host (`PGDMP` magic, `pg_restore --list` via migrate image). Uses **PostgreSQL 16 client** from the migrate image (apt.postgresql.org); backup fails early if `pg_dump` major is older than the server.

## 9. Restore

```bash
./deploy/scripts/restore-db.sh /opt/flower-erp/backups/flower_erp_YYYYMMDDTHHMMSSZ.dump
```

Stops Flower ERP containers only; does not delete Docker volumes or other databases.

## 10. Rollback application

```bash
./deploy/scripts/rollback.sh
```

Rolls back **Docker images only**. Database migrations are **not** automatically rolled back.

State file: `deploy/state/previous-deploy.env` (no secrets).

## 11. Create another director

```bash
./deploy/scripts/create-director-user.sh
```

Or via API container:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production \
  run --rm -e ALLOW_OWNER_BOOTSTRAP=true -e DIRECTOR_ORGANIZATION_ID=… \
  api node dist/scripts/create-director.js
```

## 12. Password reset

Set `DIRECTOR_RESET_PASSWORD=1` and re-run `create-director-user.sh` for existing director login.

## 13. Troubleshooting

| Symptom | Action |
|---------|--------|
| Migration failed | Read Prisma output; fix SQL; `migrate resolve`; redeploy |
| API unhealthy | `./deploy/scripts/status.sh`; check `docker compose logs api` |
| Backoffice unhealthy | Check `http://127.0.0.1:3100/health`; rebuild backoffice if URL changed |
| Failed migration P3009 | `docker compose … run --rm migrate migrate status`; resolve manually |

## 14. Commands that must never be used

- `docker compose down -v` on shared Postgres host
- `prisma migrate reset` against production
- `deploy/scripts/dev/reset-test-database.sh` on production without dev approval
- Deleting rows from `_prisma_migrations`
- `docker volume rm` on LeadFlow volumes

## Scripts layout

```
deploy/scripts/
  deploy.sh
  migrate.sh
  backup-db.sh
  restore-db.sh
  status.sh
  rollback.sh
  bootstrap-first-organization.sh
  create-director-user.sh
  init-production.sh
  lib/common.sh compose.sh health.sh database.sh
  dev/reset-test-database.sh   # dev/staging only
```

## Ports (localhost)

| Service | Host | Container |
|---------|------|-----------|
| API | 127.0.0.1:4100 | 4000 |
| Backoffice | 127.0.0.1:3100 | 3000 |
