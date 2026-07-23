# Owner / initial DIRECTOR bootstrap

Flower ERP has **no public registration**. The first organization DIRECTOR is created via a gated CLI that calls `BootstrapOwnerUseCases`.

## Production (Docker image)

```bash
cd /opt/flower-erp

docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  run --rm --no-deps -it \
  -e ALLOW_OWNER_BOOTSTRAP=true \
  api node dist/scripts/create-initial-director.js
```

Compiled path inside the API image: `/app/dist/scripts/create-initial-director.js`

## Local monorepo

```bash
# .env
ALLOW_OWNER_BOOTSTRAP=true
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
DATABASE_URL=...

pnpm --filter @flower/api create:initial-director
# or: pnpm bootstrap:owner
```

## Environment overrides (automation)

| Variable | Purpose |
|----------|---------|
| `INITIAL_ADMIN_EMAIL` | Email (stored on user; login derived from local-part) |
| `INITIAL_ADMIN_LOGIN` | Optional explicit login override |
| `INITIAL_ADMIN_PASSWORD` | Password (never logged) |
| `INITIAL_ADMIN_FULL_NAME` | Display name |
| `INITIAL_ORGANIZATION_NAME` | Organization |
| `INITIAL_STORE_NAME` | First store |
| `INITIAL_STORE_CODE` | Optional store code (otherwise derived) |

Legacy `BOOTSTRAP_*` names are still accepted.

## Behaviour

1. Requires `ALLOW_OWNER_BOOTSTRAP=true` for the process
2. Empty install: creates Organization, Store+Warehouse, User, Membership (`ALL_STORES`), system roles, DIRECTOR, AuditLog — one transaction
3. Rejects duplicate login; rejects when users already exist unless `--allow-existing-system`
4. Password hashed with Argon2id (`Argon2PasswordService`)
5. Disable the flag in production after use
