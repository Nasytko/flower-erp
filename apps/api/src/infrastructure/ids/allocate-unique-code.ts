/**
 * Allocates a unique short code like `ITM-M1ABC2XY`.
 * Format matches master-data / store code rules: 2–32 chars `[A-Z0-9_-]`.
 */
export async function allocateUniqueCode(
  prefix: string,
  exists: (code: string) => Promise<boolean>,
): Promise<string> {
  const cleanPrefix =
    prefix
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8) || 'X';

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `${cleanPrefix}-${stamp}${rand}`.slice(0, 32);
    if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) {
      continue;
    }
    if (!(await exists(code))) {
      return code;
    }
  }

  throw new Error(`Unable to allocate unique code for prefix ${prefix}`);
}
