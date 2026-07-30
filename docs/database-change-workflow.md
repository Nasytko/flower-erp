# Production database change workflow

Flower ERP uses Prisma Migrate against PostgreSQL 16. Schema changes must pass local safety checks before deploy.

## Required commands before push/deploy

```bash
pnpm verify:release
```

Minimum migration-specific checks:

```bash
pnpm migration:safety
bash scripts/test-migrations.sh
pnpm prisma:validate
```

Deploy on VPS runs `scripts/check-migration-safety.mjs` before `prisma migrate deploy`.

---

## A. Adding a table or column

1. Update `apps/api/prisma/schema.prisma`.
2. Create migration: `pnpm db:migrate` (dev) or `prisma migrate dev --name …`.
3. Open `migration.sql` manually — do not trust auto-generated enum-removal SQL.
4. Add data guards if removing values or dropping objects.
5. Run `pnpm migration:safety` and `bash scripts/test-migrations.sh`.
6. Run `pnpm verify:release`.
7. Deploy: `./deploy/scripts/deploy.sh`.

Safe defaults:

- Prefer nullable new columns, then backfill, then `SET NOT NULL` in a follow-up migration.
- Add enum values with `ALTER TYPE … ADD VALUE` when possible.

---

## B. Removing a table

**Release 1:** Remove all runtime usage (API, backoffice, permissions, api-client).

**Release 2:**

1. Take backup (`./deploy/scripts/backup-db.sh` or platform snapshot).
2. Migration with:
   - `-- @destructive-reviewed`
   - explicit `DELETE` or documented archival
   - post-delete row-count guards
   - `BEGIN;` … `COMMIT;`
3. `pnpm migration:safety` + upgrade migration test.
4. Deploy.

Never `DROP TABLE … CASCADE`.

---

## C. Changing an enum

### Add a value

```sql
ALTER TYPE "MyEnum" ADD VALUE IF NOT EXISTS 'NEW_VALUE';
```

### Rename a value

Prefer add-new + backfill + remove-old in separate releases.

### Remove a value (recreate pattern)

For each affected column:

1. Data guard: `DO $$ … RAISE EXCEPTION` if removed values still referenced.
2. `CREATE TYPE "MyEnum_new" AS ENUM (…);`
3. `ALTER COLUMN … DROP DEFAULT;` (unless column never had a default — annotate `-- @no-default`)
4. `ALTER COLUMN … TYPE "MyEnum_new" USING (col::text::"MyEnum_new");`
5. `DROP TYPE "MyEnum";`
6. `ALTER TYPE "MyEnum_new" RENAME TO "MyEnum";`
7. `ALTER COLUMN … SET DEFAULT 'VALUE'::"MyEnum";` when column had a default.

Reference: `20260729150000_remove_unused_enum_values` (SalesChannel) and hardened `20260730120000_remove_transfers_counts_cash`.

---

## D. Adding NOT NULL

1. Add nullable column (or keep nullable).
2. Backfill existing rows in migration or batch job.
3. Guard: `RAISE EXCEPTION` if NULLs remain.
4. `ALTER COLUMN … SET NOT NULL`.

---

## E. Failed migration recovery

Deploy **does not** auto-resolve failed migrations.

1. Inspect `./deploy/scripts/status.sh` and Prisma output.
2. Query `_prisma_migrations` for failed row (`finished_at IS NULL`, `rolled_back_at`).
3. Inspect partial DB state (orphan `*_new` types, half-dropped tables).
4. Fix `migration.sql` in repo (do not edit applied history on server).
5. Backup production database.
6. Only if migration truly rolled back:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production \
     --profile migrate run --rm migrate migrate resolve --rolled-back "MIGRATION_NAME"
   ```

7. `git pull` + `./deploy/scripts/deploy.sh`.

Never run `prisma migrate reset` on production.

---

## Current production recovery (`20260730120000_remove_transfers_counts_cash`)

After pulling hardened migration:

```bash
cd /opt/flower-erp
git pull
./deploy/scripts/backup-db.sh   # or platform snapshot

# Only if status shows this migration as failed:
docker compose -f docker-compose.production.yml --env-file .env.production \
  --profile migrate run --rm migrate migrate resolve --rolled-back 20260730120000_remove_transfers_counts_cash

./deploy/scripts/deploy.sh
```

Expected outcome:

- Module tables dropped (transfers, counts, cash).
- `inventory_batches.batch_source_type` default remains `'GOODS_RECEIPT'`.
- No orphan `*_new` enum types.
