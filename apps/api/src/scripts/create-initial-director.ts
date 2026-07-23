/**
 * Production-safe CLI: create the first organization DIRECTOR.
 *
 * Reuses BootstrapOwnerUseCases (transactional IAM bootstrap).
 *
 * Interactive (preferred on VPS):
 *   node dist/scripts/create-initial-director.js
 *
 * Non-interactive (automation only — never log password):
 *   INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD / …
 *
 * Requires ALLOW_OWNER_BOOTSTRAP=true for this process.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output, stderr } from 'node:process';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { BootstrapOwnerUseCases } from '../modules/identity/application/bootstrap-owner.use-cases';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { assertLogin, assertPasswordPolicy, normalizeLogin } from '../modules/identity/domain/identity-rules';
import {
  assertEmailFormat,
  deriveLoginFromEmail,
  deriveStoreCode,
  normalizeEmail,
  parseCliArgs,
  redactSecrets,
} from './create-initial-director.helpers';

const nestLogger = new Logger('CreateInitialDirector');

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
    if (value && value.trim()) return value.trim();
  }
  if (!input.isTTY) {
    fail(`Missing ${envKeys.join(' / ')} (non-interactive mode requires env vars)`);
  }
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function promptHidden(question: string, envKeys: string[]): Promise<string> {
  for (const key of envKeys) {
    const value = process.env[key];
    if (value) return value;
  }
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    fail(`Missing ${envKeys.join(' / ')} (cannot hide password without a TTY)`);
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
          output.write('\n');
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

function clearSensitiveEnv(): void {
  for (const key of [
    'INITIAL_ADMIN_PASSWORD',
    'BOOTSTRAP_OWNER_PASSWORD',
  ]) {
    if (key in process.env) {
      process.env[key] = '';
      delete process.env[key];
    }
  }
}

function printHelp(): void {
  console.log(`Usage: node dist/scripts/create-initial-director.js [--allow-existing-system]

Creates the first Organization + Store + DIRECTOR user (transactional).

Requires: ALLOW_OWNER_BOOTSTRAP=true

Interactive prompts: email, password, confirmation, full name, organization, store.
Env overrides: INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD, INITIAL_ADMIN_FULL_NAME,
  INITIAL_ORGANIZATION_NAME, INITIAL_STORE_NAME, INITIAL_ADMIN_LOGIN (optional),
  INITIAL_STORE_CODE (optional).

Backoffice login uses the derived "login" (email local-part), not the email address.
`);
}

async function main(): Promise<void> {
  const { allowExistingSystem, help } = parseCliArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    process.exit(0);
  }

  if (process.env.ALLOW_OWNER_BOOTSTRAP !== 'true') {
    fail('Set ALLOW_OWNER_BOOTSTRAP=true for this process (do not leave enabled permanently in production).');
  }

  let password = '';
  let passwordConfirm = '';

  try {
    const emailRaw = await promptLine('Email: ', ['INITIAL_ADMIN_EMAIL', 'BOOTSTRAP_OWNER_EMAIL']);
    const email = normalizeEmail(emailRaw);
    assertEmailFormat(email);

    const loginOverride = (
      process.env.INITIAL_ADMIN_LOGIN ??
      process.env.BOOTSTRAP_OWNER_LOGIN ??
      ''
    ).trim();
    const login = normalizeLogin(loginOverride || deriveLoginFromEmail(email));
    assertLogin(login);

    password = await promptHidden('Password (min 10 chars, hidden): ', [
      'INITIAL_ADMIN_PASSWORD',
      'BOOTSTRAP_OWNER_PASSWORD',
    ]);
    assertPasswordPolicy(password);

    if (input.isTTY && !process.env.INITIAL_ADMIN_PASSWORD && !process.env.BOOTSTRAP_OWNER_PASSWORD) {
      passwordConfirm = await promptHidden('Confirm password: ', []);
      if (password !== passwordConfirm) {
        fail('Password confirmation does not match');
      }
    }

    const displayName = await promptLine('Full name: ', [
      'INITIAL_ADMIN_FULL_NAME',
      'BOOTSTRAP_OWNER_DISPLAY_NAME',
    ]);
    if (displayName.length < 2) fail('Full name is required');

    const organizationName = await promptLine('Organization name: ', [
      'INITIAL_ORGANIZATION_NAME',
      'BOOTSTRAP_ORGANIZATION_NAME',
    ]);
    if (organizationName.length < 2) fail('Organization name is required');

    const storeName = await promptLine('First store name: ', [
      'INITIAL_STORE_NAME',
      'BOOTSTRAP_STORE_NAME',
    ]);
    if (storeName.length < 2) fail('Store name is required');

    const storeCode = (
      process.env.INITIAL_STORE_CODE ??
      process.env.BOOTSTRAP_STORE_CODE ??
      deriveStoreCode(storeName)
    ).trim();

    nestLogger.log('Connecting Nest application context...');
    const app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: ['error', 'warn', 'log'],
    });

    try {
      const prisma = app.get(PrismaService);
      await prisma.$connect();
      ok('Database connection established');

      const userCount = await prisma.user.count();
      const orgCount = await prisma.organization.count();
      if ((userCount > 0 || orgCount > 0) && !allowExistingSystem) {
        fail(
          `Installation is not empty (users=${userCount}, organizations=${orgCount}). ` +
            'Refusing to bootstrap. Use --allow-existing-system only if you intentionally create another organization director.',
        );
      }
      if (userCount === 0 && orgCount === 0) {
        ok('Empty installation confirmed');
      } else {
        ok('Existing installation acknowledged (--allow-existing-system)');
      }

      const bootstrap = app.get(BootstrapOwnerUseCases);
      const result = await bootstrap.bootstrapOwner({
        login,
        password,
        displayName,
        email,
        organizationName,
        storeName,
        storeCode,
        allowExistingSystem,
      });

      ok('Organization created');
      ok('Store created');
      ok('User created');
      ok('DIRECTOR role assigned');
      ok('Store access granted (ALL_STORES)');
      ok('Initial director created successfully');
      console.log('');
      console.log(`Email: ${email}`);
      console.log(`Login: ${result.login}`);
      console.log(`Organization: ${organizationName}`);
      console.log(`Store: ${storeName}`);
      console.log('');
      console.log('Sign in at the Backoffice using Login (not email) and your password.');
      console.log('Then set ALLOW_OWNER_BOOTSTRAP=false in .env.production and recreate the API container.');
    } finally {
      await app.close();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const safe = redactSecrets(message, [password, passwordConfirm].filter(Boolean));
    // Nest HTTP exceptions often put details in getResponse()
    if (err && typeof err === 'object' && 'getResponse' in err && typeof (err as { getResponse: () => unknown }).getResponse === 'function') {
      const body = (err as { getResponse: () => unknown }).getResponse();
      const code =
        body && typeof body === 'object' && 'code' in body
          ? String((body as { code: unknown }).code)
          : body && typeof body === 'object' && 'message' in body
            ? JSON.stringify((body as { message: unknown }).message)
            : safe;
      stderr.write(`[ERROR] ${code}\n`);
    } else {
      stderr.write(`[ERROR] ${safe}\n`);
    }
    process.exit(1);
  } finally {
    password = '';
    passwordConfirm = '';
    clearSensitiveEnv();
  }
}

main();
