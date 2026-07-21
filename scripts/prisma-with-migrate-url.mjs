/**
 * Runs Prisma CLI with DATABASE_MIGRATE_URL preferred over DATABASE_URL.
 * Usage: node scripts/prisma-with-migrate-url.mjs migrate deploy
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, '..', 'apps', 'api');
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/prisma-with-migrate-url.mjs <prisma args…>');
  process.exit(1);
}

const env = { ...process.env };
if (env.DATABASE_MIGRATE_URL) {
  env.DATABASE_URL = env.DATABASE_MIGRATE_URL;
}

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL or DATABASE_MIGRATE_URL is required');
  process.exit(1);
}

const result = spawnSync('pnpm', ['exec', 'prisma', ...args], {
  cwd: apiDir,
  env,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
