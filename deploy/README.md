# Flower ERP — Production deployment on shared VPS (ORVIX-safe)

Deploy Flower ERP alongside an existing ORVIX Docker stack **without** sharing ports, networks, volumes, or database objects.

## Design principles

| Concern | Flower ERP | ORVIX (unchanged) |
|---------|------------|-------------------|
| Compose project | `flower-erp` | own project name |
| Directory | `/opt/flower-erp` | existing path |
| Public ports | **none** (127.0.0.1 only) | keeps 80/443 |
| Container names | `flower-erp-*` | unchanged |
| Network | `flower-erp-internal` + external `leadflow_default` (API/migrate only) | unchanged |
| PostgreSQL | DB `flower_erp`, user `flower_user` | own DB/users |
| Volumes | `flower-erp-backups` (optional) | untouched |

## Files in this repository

| File | Purpose |
|------|---------|
| `apps/api/Dockerfile` | Production multi-stage API (+ `migrate` target) |
| `apps/backoffice/Dockerfile` | Production multi-stage Backoffice (Next standalone) |
| `docker-compose.production.yml` | Production compose (no Postgres service) |
| `.env.production.example` | Environment template (no secrets) |
| `deploy/scripts/migrate.sh` | Safe migration job before rollout |
| `deploy/scripts/deploy.sh` | Build → migrate → deploy |
| `deploy/scripts/backup-db.sh` | `pg_dump` for `flower_erp` only |
| `deploy/scripts/restore-db.sh` | `pg_restore` for `flower_erp` only |
| `deploy/nginx/flower-erp.conf.example` | Reverse-proxy upstream snippet |

Legacy dev/CI Dockerfiles remain at `docker/api/Dockerfile` and `docker/backoffice/Dockerfile`.

## Ports (localhost only)

| Service | Host bind | Container port |
|---------|-----------|----------------|
| API | `127.0.0.1:4100` (override: `FLOWER_API_PORT`) | `4000` |
| Backoffice | `127.0.0.1:3100` (override: `FLOWER_BACKOFFICE_PORT`) | `3000` |

No binding on `0.0.0.0`. Ports **80/443** stay with the existing reverse proxy.

## Networks & volumes

**Network created:** `flower-erp-internal` (bridge, isolated)

**Volume declared:** `flower-erp-backups` (optional; host backups default to `/opt/flower-erp/backups`)

**Not created / not touched:** any ORVIX network, volume, or container.

---

## 1. PostgreSQL setup (existing instance)

Run as PostgreSQL superuser (`postgres`). **Do not reuse ORVIX roles or databases.**

```sql
-- Roles (choose strong passwords; store only in /opt/flower-erp/.env.production)
CREATE ROLE flower_user LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
CREATE ROLE flower_migrate LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';

-- Database owned by migrate role (DDL)
CREATE DATABASE flower_erp OWNER flower_migrate ENCODING 'UTF8';

REVOKE ALL ON DATABASE flower_erp FROM PUBLIC;
GRANT CONNECT ON DATABASE flower_erp TO flower_user;
GRANT CONNECT ON DATABASE flower_erp TO flower_migrate;

\c flower_erp

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO flower_user;
GRANT USAGE ON SCHEMA public TO flower_migrate;

-- Runtime DML (API)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO flower_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO flower_user;
ALTER DEFAULT PRIVILEGES FOR ROLE flower_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flower_user;
ALTER DEFAULT PRIVILEGES FOR ROLE flower_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO flower_user;

-- Migration DDL (migrate job)
GRANT CREATE ON SCHEMA public TO flower_migrate;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO flower_migrate;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO flower_migrate;
ALTER DEFAULT PRIVILEGES FOR ROLE flower_migrate IN SCHEMA public
  GRANT ALL ON TABLES TO flower_migrate;
ALTER DEFAULT PRIVILEGES FOR ROLE flower_migrate IN SCHEMA public
  GRANT ALL ON SEQUENCES TO flower_migrate;
```

On a small VPS you may use a single role for both URLs (not ideal, but acceptable):

```sql
-- Simplified: one role
CREATE ROLE flower_user LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
CREATE DATABASE flower_erp OWNER flower_user ENCODING 'UTF8';
```

Then set `DATABASE_URL` and `DATABASE_MIGRATE_URL` to the same connection string.

---

## 2. First deploy

```bash
# On VPS — separate directory, separate project
sudo mkdir -p /opt/flower-erp/backups
sudo chown "$USER:$USER" /opt/flower-erp

# Copy/sync release (git clone, rsync, or CI artifact)
cd /opt/flower-erp
cp .env.production.example .env.production
nano .env.production   # fill secrets, domains, DB URLs

chmod +x deploy/scripts/*.sh

# Verify no port conflict with ORVIX
ss -tlnp | grep -E ':(3100|4100)\b'   # should be empty

# Deploy (build → migrate → start)
./deploy/scripts/deploy.sh

# Verify local health
curl -sf http://127.0.0.1:4100/api/v1/health/live
curl -sf http://127.0.0.1:4100/api/v1/health/ready
curl -sf -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/
```

### Reverse proxy

Add `deploy/nginx/flower-erp.conf.example` to your **existing** nginx (ORVIX config untouched):

```bash
sudo cp deploy/nginx/flower-erp.conf.example /etc/nginx/snippets/flower-erp.conf
# include inside your TLS server blocks
sudo nginx -t && sudo systemctl reload nginx
```

Set in `.env.production`:

- `NEXT_PUBLIC_API_BASE_URL=https://flower-api.example.com/api/v1`
- `CORS_ORIGINS=https://flower.example.com`

Rebuild backoffice after changing `NEXT_PUBLIC_API_BASE_URL`:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production build backoffice
docker compose -f docker-compose.production.yml --env-file .env.production up -d backoffice
```

---

## 3. Updates (standard rollout)

```bash
cd /opt/flower-erp
git pull   # or rsync new release
./deploy/scripts/deploy.sh
```

`deploy.sh` always runs migrations **before** recreating the API container.

Manual migration only:

```bash
./deploy/scripts/migrate.sh
```

---

## 4. Rollback

### Application rollback (keep DB schema)

```bash
cd /opt/flower-erp

# Pin previous image tags in .env.production, e.g.:
#   FLOWER_API_IMAGE=flower-erp-api:20260717-1200
#   FLOWER_BACKOFFICE_IMAGE=flower-erp-backoffice:20260717-1200

docker compose -f docker-compose.production.yml --env-file .env.production up -d --no-deps --force-recreate api
docker compose -f docker-compose.production.yml --env-file .env.production up -d --force-recreate backoffice
```

Tag images before each deploy for easy rollback:

```bash
docker tag flower-erp-api:production flower-erp-api:$(date -u +%Y%m%d-%H%M%S)
```

### Full rollback (app + database)

```bash
./deploy/scripts/restore-db.sh /opt/flower-erp/backups/flower_erp_YYYYMMDDTHHMMSSZ.dump
./deploy/scripts/deploy.sh   # or start pinned image tags
```

### Emergency stop (Flower only)

```bash
docker compose -f docker-compose.production.yml --env-file .env.production stop api backoffice
# ORVIX containers are not affected
```

---

## 5. Backup & restore

```bash
# Daily cron example (flower_erp only)
0 3 * * * /opt/flower-erp/deploy/scripts/backup-db.sh >> /var/log/flower-erp-backup.log 2>&1
```

Requires `postgresql-client` (`pg_dump`, `pg_restore`) on the host.

---

## 6. EPIC 12 DB verification on VPS

After first deploy and DB setup:

```bash
cd /opt/flower-erp
export DATABASE_URL='postgresql://flower_migrate:SECRET@127.0.0.1:5432/flower_erp?schema=public'
export DATABASE_MIGRATE_URL="$DATABASE_URL"
export JWT_ACCESS_SECRET='ci-test-access-secret-min-32-chars-long'
export JWT_REFRESH_SECRET='ci-test-refresh-secret-min-32-chars-long'
export ALLOW_OWNER_BOOTSTRAP=true

# Migrations from scratch (already done by deploy.sh; safe to re-run)
./deploy/scripts/migrate.sh

# Integration + E2E (run on host with Node 20 + pnpm, or one-off container)
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @flower/api test:integration
pnpm --filter @flower/api test:e2e
```

Or via Docker one-shot (uses migrate image + dev deps not included — prefer host Node for tests):

```bash
docker compose -f docker-compose.production.yml --env-file .env.production run --rm \
  -e DATABASE_URL -e DATABASE_MIGRATE_URL -e JWT_ACCESS_SECRET -e JWT_REFRESH_SECRET \
  --entrypoint bash api -c 'cd /app && pnpm --filter @flower/api test:integration'
```

---

## 7. Migrate database to external DBaaS (future)

1. Create `flower_erp` + roles on DBaaS provider.
2. Backup from VPS Postgres:
   ```bash
   ./deploy/scripts/backup-db.sh
   ```
3. Restore to DBaaS:
   ```bash
   PGPASSWORD=... pg_restore -h db.provider.com -U flower_migrate -d flower_erp --no-owner --no-privileges backup.dump
   ```
4. Update `.env.production`:
   ```env
   DATABASE_URL=postgresql://flower_user:SECRET@db.provider.com:5432/flower_erp?sslmode=require
   DATABASE_MIGRATE_URL=postgresql://flower_migrate:SECRET@db.provider.com:5432/flower_erp?sslmode=require
   FLOWER_DB_HOST=db.provider.com
   ```
5. Run migrations against new host:
   ```bash
   ./deploy/scripts/migrate.sh
   ```
6. Redeploy app:
   ```bash
   ./deploy/scripts/deploy.sh
   ```
7. Verify health, then decommission local `flower_erp` DB on VPS Postgres (ORVIX DB untouched).

---

## 8. ORVIX conflict checklist

Before and after deploy:

```bash
# Flower project only
docker compose -p flower-erp ps

# Must NOT show ORVIX containers
docker ps --filter name=flower-erp

# No public Flower ports
ss -tlnp | grep -E '127.0.0.1:(3100|4100)'

# No Flower volumes except flower-erp-backups
docker volume ls | grep flower-erp
```

**Never run:**

```bash
docker system prune -a --volumes   # would destroy ORVIX volumes
docker compose down -v             # in ORVIX directory
```

Flower teardown (safe):

```bash
docker compose -f docker-compose.production.yml --env-file .env.production down
# omit -v unless you intentionally remove flower-erp-backups volume
```

---

## Resource limits (defaults)

| Service | CPUs | Memory limit | Reservation |
|---------|------|--------------|-------------|
| API | 0.75 | 768 MB | 256 MB |
| Backoffice | 0.50 | 512 MB | 128 MB |

Override via `.env.production` (`FLOWER_API_CPUS`, etc.).

## Logging

Docker json-file driver with rotation: **10 MB × 5 files**, compressed.

## Healthchecks & restart

- `restart: unless-stopped` on API and Backoffice
- HTTP healthchecks on `/api/v1/health/live` (API) and `/` (Backoffice)
- Migrate job: `restart: "no"` (one-shot)
