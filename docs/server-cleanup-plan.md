# Server Cleanup Plan — Flower ERP Production

**Purpose:** Document what happens automatically during deploy vs what requires manual review on the VPS (`/opt/flower-erp`).

Related: [`deploy/scripts/deploy.sh`](../deploy/scripts/deploy.sh), [`cleanup-stage-c-report.md`](./cleanup-stage-c-report.md)

---

## What is removed automatically

| Action | When | Mechanism |
|--------|------|-----------|
| Tracked files deleted from Git | `git pull` / checkout | Git removes files no longer in tree |
| Orphan Docker containers | After successful deploy | `docker compose up -d --remove-orphans` |
| Dangling Docker images | After successful health checks | `docker image prune -f` |
| Build cache older than 7 days | After successful health checks | `docker builder prune -f --filter until=168h` (if supported) |
| Allowlisted legacy untracked paths | Before deploy | `SAFE_LEGACY_PATHS` in `deploy.sh` (currently **empty**) |

---

## What is NOT removed automatically

| Item | Reason |
|------|--------|
| `.env.production` | Secrets; never touched by deploy |
| PostgreSQL data / volumes | No `down -v`; ORVIX DB untouched |
| `backups/` directory | Explicit retention; Stage C backups |
| Uploads / user files | Not in deploy scope |
| TLS certificates / nginx config | Managed outside compose |
| Reverse-proxy data | ORVIX stack |
| Untracked files (general) | Only listed via `git status`; never `git clean` |
| Named Docker volumes | `flower-erp-backups` preserved |
| Active production images | Only dangling images pruned |

**Never run on shared VPS:**

```bash
git clean -fd
git clean -fdx
docker compose down -v
docker volume prune
docker system prune -a --volumes
prisma migrate reset
```

---

## Manual diagnostics (read-only)

Run on the server before/after deploy:

```bash
cd /opt/flower-erp

git status --short
git clean -nd          # preview only — do NOT run git clean -fd

docker compose -f docker-compose.production.yml --env-file .env.production ps -a
docker volume ls
docker image ls
docker system df

du -sh /opt/flower-erp/* 2>/dev/null | sort -h
```

Stage C pre-deploy audit (when migrations pending):

```bash
source .env.production
psql "$DATABASE_MIGRATE_URL" -v ON_ERROR_STOP=1 -f scripts/audit-removable-data.sql
./deploy/scripts/backup-db.sh
DATABASE_URL="$DATABASE_MIGRATE_URL" ./scripts/backup-stage-c-tables.sh
```

---

## First deploy after Stage C

Required flags for destructive migrations:

```bash
RUN_STAGE_C_AUDIT=1 \
RUN_STAGE_C_BACKUP=1 \
ALLOW_DESTRUCTIVE_MIGRATIONS=1 \
  ./deploy/scripts/deploy.sh
```

Subsequent deploys do not require these flags once Stage C migrations are applied.

---

## Rollback

1. Stop app containers (optional): `docker compose ... stop api backoffice`
2. Restore DB: `./deploy/scripts/restore-db.sh backups/flower_erp_*.dump`
3. Pin previous image tags in `.env.production`
4. Recreate containers: `docker compose ... up -d --force-recreate api backoffice`

Prisma cannot auto-rollback destructive migrations — DB restore is required.
