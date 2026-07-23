/**
 * Pure helpers for create-initial-director CLI (unit-testable, no Nest imports).
 */

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function assertEmailFormat(email: string): void {
  // Practical production check — not a full RFC parser.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Invalid email address');
  }
}

/**
 * Auth identity is `login` (not email). Derive a valid login from an email local-part
 * using the same charset rules as assertLogin / normalizeLogin.
 */
export function deriveLoginFromEmail(email: string): string {
  const local = normalizeEmail(email).split('@')[0] ?? '';
  let login = local.replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+/, '');
  if (login.length < 3) {
    login = `u${login}`.padEnd(3, '0');
  }
  return login.slice(0, 64);
}

/** Derive a store code compatible with normalizeStoreCode (2–32 A-Z0-9_-). */
export function deriveStoreCode(storeName: string): string {
  const ascii = storeName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  let code = ascii.slice(0, 32);
  if (code.length < 2) {
    code = 'MAIN';
  }
  if (!/^[A-Z0-9]/.test(code)) {
    code = `S${code}`.slice(0, 32);
  }
  return code;
}

export function parseCliArgs(argv: string[]): { allowExistingSystem: boolean; help: boolean } {
  return {
    allowExistingSystem: argv.includes('--allow-existing-system'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret) continue;
    out = out.split(secret).join('[REDACTED]');
  }
  return out;
}
