function cleanPrefix(prefix: string): string {
  return (
    prefix
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8) || 'X'
  );
}

/** Catalog code: `ITM-0001` (no date segment). */
export function formatSequentialCode(prefix: string, seq: number): string {
  const p = cleanPrefix(prefix);
  return `${p}-${String(seq).padStart(4, '0')}`;
}

/** Parse trailing sequence from `ITM-0007` → 7. Ignores legacy `ITM-YYYYMMDD-0007`. */
export function parseSequentialCodeSeq(code: string, prefix: string): number | null {
  const p = cleanPrefix(prefix);
  const head = `${p}-`;
  if (!code.startsWith(head)) return null;
  const tail = code.slice(head.length);
  if (!tail || tail.includes('-')) return null;
  if (!/^\d{1,8}$/.test(tail)) return null;
  return Number(tail);
}

/**
 * Allocates a unique catalog code with org-wide sequential counter per prefix.
 * Format: `PREFIX-0001` (2–32 chars `[A-Z0-9_-]`).
 */
export async function allocateSequentialCode(
  prefix: string,
  exists: (code: string) => Promise<boolean>,
  options?: {
    listExistingWithPrefix?: (codePrefix: string) => Promise<string[]>;
  },
): Promise<string> {
  const p = cleanPrefix(prefix);
  const codePrefix = `${p}-`;

  let seq = 1;
  if (options?.listExistingWithPrefix) {
    const rows = await options.listExistingWithPrefix(codePrefix);
    let max = 0;
    for (const code of rows) {
      const parsed = parseSequentialCodeSeq(code, p);
      if (parsed != null && parsed > max) max = parsed;
    }
    seq = max + 1;
  }

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const code = formatSequentialCode(p, seq);
    if (!(await exists(code))) {
      return code;
    }
    seq += 1;
  }

  throw new Error(`Unable to allocate sequential code for prefix ${prefix}`);
}
