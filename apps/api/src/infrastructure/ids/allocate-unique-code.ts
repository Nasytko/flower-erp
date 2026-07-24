import {
  allocateDocumentNumber,
  parseDocumentSeq,
} from './allocate-document-number';

/**
 * Allocates a unique catalog/store code: `ITM-20260724-0001`.
 * Format matches master-data / store code rules: 2–32 chars `[A-Z0-9_-]`.
 */
export async function allocateUniqueCode(
  prefix: string,
  exists: (code: string) => Promise<boolean>,
  options?: {
    now?: Date;
    listExistingForDay?: (dayPrefix: string) => Promise<string[]>;
  },
): Promise<string> {
  return allocateDocumentNumber(prefix, exists, {
    now: options?.now,
    maxSeqForDay: options?.listExistingForDay
      ? async (dayPrefix) => {
          const rows = await options.listExistingForDay!(dayPrefix);
          let max = 0;
          for (const code of rows) {
            const seq = parseDocumentSeq(code, dayPrefix);
            if (seq != null && seq > max) max = seq;
          }
          return max;
        }
      : undefined,
  });
}
