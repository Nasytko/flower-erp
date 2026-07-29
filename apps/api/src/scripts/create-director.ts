/**
 * CLI: create or attach a DIRECTOR for an existing organization.
 * Requires ALLOW_OWNER_BOOTSTRAP=true for the process.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output, stderr } from 'node:process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CreateDirectorUseCases } from '../modules/identity/application/create-director.use-cases';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { assertLogin, assertPasswordPolicy, normalizeLogin } from '../modules/identity/domain/identity-rules';
import {
  assertEmailFormat,
  normalizeEmail,
  parseCliArgs,
  redactSecrets,
} from './create-initial-director.helpers';

function ok(message: string): void {
  console.log(`[OK] ${message}`);
}

function fail(message: string): never {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}

async function promptLine(question: string, envKeys: string[]): Promise<string> {
  for (const key of envKeys) {
    const value = process.env[key];
    if (value?.trim()) return value.trim();
  }
  if (!input.isTTY) fail(`Missing ${envKeys.join(' / ')} (non-interactive mode requires env vars)`);
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function promptHidden(question: string): Promise<string> {
  const file = process.env.DIRECTOR_PASSWORD_FILE?.trim();
  if (file) {
    const fs = await import('node:fs/promises');
    return (await fs.readFile(file, 'utf8')).trim();
  }
  for (const key of ['DIRECTOR_PASSWORD', 'INITIAL_ADMIN_PASSWORD']) {
    if (process.env[key]) return process.env[key]!;
  }
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    fail('Set DIRECTOR_PASSWORD_FILE or DIRECTOR_PASSWORD (cannot hide password without TTY)');
  }
  output.write(question);
  return new Promise((resolve, reject) => {
    let value = '';
    input.setRawMode(true);
    input.resume();
    const onData = (chunk: Buffer | string) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (const char of str) {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          cleanup();
          output.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          reject(new Error('Interrupted'));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (char < ' ') continue;
        value += char;
      }
    };
    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
    };
    input.on('data', onData);
  });
}

async function main(): Promise<void> {
  let password = '';
  const { help } = parseCliArgs(process.argv.slice(2));
  if (help) {
    console.log(`Usage: node dist/scripts/create-director.js

Creates or attaches a DIRECTOR for an organization (requires ALLOW_OWNER_BOOTSTRAP=true).

Env: DIRECTOR_ORGANIZATION_ID, DIRECTOR_LOGIN, DIRECTOR_DISPLAY_NAME, DIRECTOR_EMAIL,
     DIRECTOR_PASSWORD or DIRECTOR_PASSWORD_FILE, DIRECTOR_ATTACH_EXISTING=1, DIRECTOR_RESET_PASSWORD=1
`);
    process.exit(0);
  }

  if (process.env.ALLOW_OWNER_BOOTSTRAP !== 'true') {
    fail('Set ALLOW_OWNER_BOOTSTRAP=true for this process.');
  }

  try {
    const organizationId = await promptLine('Organization ID: ', ['DIRECTOR_ORGANIZATION_ID']);
    const loginRaw = await promptLine('Login: ', ['DIRECTOR_LOGIN']);
    const login = normalizeLogin(loginRaw);
    assertLogin(login);
    const displayName = await promptLine('Display name: ', ['DIRECTOR_DISPLAY_NAME']);
    const emailRaw = await promptLine('Email (optional): ', ['DIRECTOR_EMAIL']);
    const email = emailRaw ? normalizeEmail(emailRaw) : null;
    if (email) assertEmailFormat(email);

    password = await promptHidden('Temporary password (hidden): ');
    assertPasswordPolicy(password);

    const attachExistingUser = process.env.DIRECTOR_ATTACH_EXISTING === '1';
    const resetPassword = process.env.DIRECTOR_RESET_PASSWORD === '1';

    const app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: ['error', 'warn', 'log'],
    });
    try {
      await app.get(PrismaService).$connect();
      const useCases = app.get(CreateDirectorUseCases);
      const result = await useCases.createDirector({
        organizationId,
        login,
        password,
        displayName,
        email,
        attachExistingUser,
        resetPassword,
      });
      if (result.alreadyDirector && !result.assignedDirector && !result.passwordReset) {
        ok(`User ${result.login} is already DIRECTOR in organization ${result.organizationId}`);
      } else {
        ok('Director user ready');
        console.log(`Organization ID: ${result.organizationId}`);
        console.log(`User login: ${result.login}`);
        console.log(`Membership ID: ${result.membershipId}`);
      }
    } finally {
      await app.close();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    stderr.write(`[ERROR] ${redactSecrets(message, [password].filter(Boolean))}\n`);
    process.exit(1);
  } finally {
    password = '';
    delete process.env.DIRECTOR_PASSWORD;
  }
}

main();
