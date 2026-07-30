#!/usr/bin/env node
/**
 * Static safety linter for Prisma SQL migrations.
 * Legacy migrations (already applied in production) are informational only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'apps', 'api', 'prisma', 'migrations');

/** Migrations applied before the hardened pipeline; not held to new strict rules. */
const LEGACY_MIGRATIONS = new Set([
  '20260715000000_init_system_bootstrap',
  '20260715120000_org_store_warehouse_audit',
  '20260715200000_master_data',
  '20260715210000_master_data_hardening_and_supply_inventory',
  '20260715230000_identity_and_access',
  '20260715240000_orders_and_reservations',
  '20260716120000_customer_order_composition',
  '20260716180000_sales_and_inventory_issue',
  '20260716200000_order_timeline_sale_events',
  '20260716210000_payments_and_cash',
  '20260716220000_workspace_and_composition_concurrency',
  '20260717000000_delivery_operations',
  '20260717120000_inventory_operations',
  '20260717130000_inventory_operations_hardening',
  '20260724100000_store_city',
  '20260724120000_item_created_by',
  '20260727100000_organization_integration_settings',
  '20260728160000_item_minimum_stock_quantity',
  '20260728170000_supply_document_fields',
  '20260729120000_item_retail_prices',
  '20260729140000_remove_obsolete_erp_tables',
  '20260729150000_remove_unused_enum_values',
]);

const FORBIDDEN_PATTERNS = [
  { id: 'drop-type-cascade', re: /DROP\s+TYPE[^;]*CASCADE/i, message: 'DROP TYPE ... CASCADE is forbidden' },
  { id: 'drop-table-cascade', re: /DROP\s+TABLE[^;]*CASCADE/i, message: 'DROP TABLE ... CASCADE is forbidden' },
  { id: 'migrate-reset', re: /migrate\s+reset/i, message: 'prisma migrate reset must not appear in migrations' },
  { id: 'db-push-force-reset', re: /db\s+push[^;\n]*--force-reset|--force-reset[^;\n]*db\s+push/i, message: 'db push --force-reset is forbidden' },
];

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      name,
      file: path.join(MIGRATIONS_DIR, name, 'migration.sql'),
    }))
    .filter(({ file }) => fs.existsSync(file));
}

function hasAnnotation(sql, annotation) {
  return sql.includes(annotation);
}

function findEnumRecreateBlocks(sql) {
  const blocks = [];
  const createRe = /CREATE\s+TYPE\s+"([^"]+)_new"/gi;
  let match;
  while ((match = createRe.exec(sql)) !== null) {
    const newType = match[1] + '_new';
    const slice = sql.slice(match.index, match.index + 4000);
    const alterMatch = slice.match(
      /ALTER\s+TABLE\s+"([^"]+)"\s+[\s\S]*?ALTER\s+COLUMN\s+"([^"]+)"\s+TYPE\s+"([^"]+)"/i,
    );
    if (!alterMatch) continue;
    const [, table, column, targetType] = alterMatch;
    if (targetType !== newType) continue;
    const blockStart = match.index;
    const contextBefore = sql.slice(Math.max(0, blockStart - 1200), blockStart);
    const dropOld = slice.match(/DROP\s+TYPE\s+"([^"]+)"/i);
    const oldType = dropOld?.[1] ?? null;
    const section = sql.slice(blockStart, blockStart + 4000);
    const hasDropDefault = /ALTER\s+COLUMN\s+"[^"]+"\s+DROP\s+DEFAULT/i.test(section);
    const hasNoDefaultAnnotation =
      /--\s*@no-default/i.test(section) || /--\s*@no-default/i.test(contextBefore);
    const hasSetDefault = /ALTER\s+COLUMN\s+"[^"]+"\s+SET\s+DEFAULT/i.test(section);
    blocks.push({
      table,
      column,
      oldType,
      newType: targetType,
      hasDropDefault,
      hasNoDefaultAnnotation,
      hasSetDefault,
      blockStart,
    });
  }
  return blocks;
}

function lintMigration(name, sql) {
  const issues = [];
  const isLegacy = LEGACY_MIGRATIONS.has(name);
  const destructiveReviewed = hasAnnotation(sql, '@destructive-reviewed');
  const dataGuarded = hasAnnotation(sql, '@data-guarded');

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.re.test(sql)) {
      issues.push({ level: isLegacy ? 'warn' : 'error', rule: pattern.id, message: pattern.message });
    }
  }

  const hasDestructive =
    /\bDROP\s+TABLE\b/i.test(sql) ||
    /\bDROP\s+COLUMN\b/i.test(sql) ||
    /CREATE\s+TYPE\s+"[^"]+_new"/i.test(sql);

  if (hasDestructive && !/\bBEGIN\s*;/i.test(sql) && !/\bCOMMIT\s*;/i.test(sql)) {
    issues.push({
      level: isLegacy ? 'warn' : 'error',
      rule: 'missing-transaction',
      message: 'Destructive migration must be wrapped in BEGIN; ... COMMIT;',
    });
  }

  if (/\bDROP\s+TABLE\b/i.test(sql) && !destructiveReviewed && !isLegacy) {
    issues.push({
      level: 'error',
      rule: 'drop-table-unreviewed',
      message: 'DROP TABLE requires -- @destructive-reviewed (or explicit post-delete guards)',
    });
  }

  if (/\bDROP\s+COLUMN\b/i.test(sql) && !destructiveReviewed && !isLegacy) {
    issues.push({
      level: 'error',
      rule: 'drop-column-unreviewed',
      message: 'DROP COLUMN requires -- @destructive-reviewed',
    });
  }

  const enumBlocks = findEnumRecreateBlocks(sql);
  for (const block of enumBlocks) {
    if (!block.hasDropDefault && !block.hasNoDefaultAnnotation) {
      issues.push({
        level: isLegacy ? 'warn' : 'error',
        rule: 'enum-missing-drop-default',
        message: `Enum recreate on ${block.table}.${block.column} must DROP DEFAULT before ALTER TYPE (or annotate -- @no-default)`,
      });
    }
    if (
      block.hasDropDefault &&
      !block.hasSetDefault &&
      !block.hasNoDefaultAnnotation &&
      !isLegacy
    ) {
      issues.push({
        level: 'warn',
        rule: 'enum-missing-set-default',
        message: `Enum recreate on ${block.table}.${block.column} dropped DEFAULT but did not SET DEFAULT afterward`,
      });
    }
  }

  if (/CREATE\s+TYPE\s+"[^"]+_new"/i.test(sql) && !/RAISE\s+EXCEPTION/i.test(sql) && !isLegacy) {
    issues.push({
      level: 'error',
      rule: 'enum-shrink-without-guard',
      message: 'Enum value removal must include a DO $$ ... RAISE EXCEPTION data guard',
    });
  }

  if (hasDestructive && !dataGuarded && !destructiveReviewed && !isLegacy) {
    issues.push({
      level: 'warn',
      rule: 'destructive-without-guard-annotation',
      message: 'Destructive migration should include -- @data-guarded or -- @destructive-reviewed',
    });
  }

  return issues.map((issue) => ({ ...issue, migration: name, legacy: isLegacy }));
}

function main() {
  const migrations = listMigrationFiles();
  const allIssues = migrations.flatMap(({ name, file }) => lintMigration(name, fs.readFileSync(file, 'utf8')));

  const errors = allIssues.filter((i) => i.level === 'error');
  const warnings = allIssues.filter((i) => i.level === 'warn');

  if (warnings.length > 0) {
    console.warn('Migration safety warnings:');
    for (const issue of warnings) {
      console.warn(`  [${issue.rule}] ${issue.migration}: ${issue.message}`);
    }
  }

  if (errors.length > 0) {
    console.error('Migration safety errors:');
    for (const issue of errors) {
      console.error(`  [${issue.rule}] ${issue.migration}: ${issue.message}`);
    }
    console.error('');
    console.error('Fix checklist:');
    console.error('  1. Open migration.sql — wrap destructive changes in BEGIN; ... COMMIT;');
    console.error('  2. Add -- @destructive-reviewed for intentional DROP TABLE/COLUMN');
    console.error('  3. Add data guards (DO $$ ... RAISE EXCEPTION) before enum shrink / DROP');
    console.error('  4. Enum columns: DROP DEFAULT → ALTER TYPE → SET DEFAULT (see .cursor/rules/database-migrations.mdc)');
    console.error('  5. Add migration.test.json for upgrade/negative tests when migration is risky');
    console.error('  6. Run: pnpm verify:release');
    process.exit(1);
  }

  console.log(`Migration safety OK (${migrations.length} migrations checked, ${warnings.length} legacy warnings).`);
}

main();
