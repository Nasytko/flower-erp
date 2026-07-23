#!/usr/bin/env node
/**
 * @deprecated Prefer: pnpm --filter @flower/api create:initial-director
 * or production: node dist/scripts/create-initial-director.js
 *
 * Thin wrapper kept for older docs/scripts.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/api');
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', 'src/scripts/create-initial-director.ts', ...process.argv.slice(2)],
  { cwd: apiRoot, stdio: 'inherit', env: process.env },
);
process.exit(result.status ?? 1);
