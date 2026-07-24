/**
 * Human-readable document / catalog numbers.
 * Format: `PREFIX-YYYYMMDD-0001` (e.g. ORD-20260724-0003).
 */

function cleanPrefix(prefix: string): string {
  return (
    prefix
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8) || 'X'
  );
}

export function formatDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function formatDocumentNumber(prefix: string, date: Date, seq: number): string {
  const p = cleanPrefix(prefix);
  return `${p}-${formatDayKey(date)}-${String(seq).padStart(4, '0')}`;
}

/**
 * Allocates the next free number for a day.
 * `exists` must check uniqueness within the org (or globally for codes).
 * Optional `maxSeqForDay` returns the highest used sequence for PREFIX-YYYYMMDD-*, or 0.
 */
export async function allocateDocumentNumber(
  prefix: string,
  exists: (number: string) => Promise<boolean>,
  options?: {
    now?: Date;
    maxSeqForDay?: (dayPrefix: string) => Promise<number>;
  },
): Promise<string> {
  const now = options?.now ?? new Date();
  const p = cleanPrefix(prefix);
  const dayPrefix = `${p}-${formatDayKey(now)}-`;

  let seq = 1;
  if (options?.maxSeqForDay) {
    const max = await options.maxSeqForDay(dayPrefix);
    if (Number.isFinite(max) && max >= 0) {
      seq = Math.floor(max) + 1;
    }
  }

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const number = formatDocumentNumber(p, now, seq);
    if (!(await exists(number))) {
      return number;
    }
    seq += 1;
  }

  throw new Error(`Unable to allocate document number for prefix ${prefix}`);
}

/** Parse trailing sequence from `PREFIX-YYYYMMDD-0007` → 7. */
export function parseDocumentSeq(number: string, dayPrefix: string): number | null {
  if (!number.startsWith(dayPrefix)) return null;
  const tail = number.slice(dayPrefix.length);
  if (!/^\d{1,8}$/.test(tail)) return null;
  return Number(tail);
}
