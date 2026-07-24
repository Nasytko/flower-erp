import {
  allocateDocumentNumber,
  parseDocumentSeq,
} from './allocate-document-number';

/**
 * Next org-scoped document number: `PREFIX-YYYYMMDD-0001`.
 * Works for models with a `number` field.
 */
export async function allocateOrgDocumentNumber(input: {
  prefix: string;
  organizationId: string;
  exists: (number: string) => Promise<boolean>;
  listByNumberPrefix: (dayPrefix: string) => Promise<string[]>;
  now?: Date;
}): Promise<string> {
  return allocateDocumentNumber(input.prefix, input.exists, {
    now: input.now,
    maxSeqForDay: async (dayPrefix) => {
      const numbers = await input.listByNumberPrefix(dayPrefix);
      let max = 0;
      for (const number of numbers) {
        const seq = parseDocumentSeq(number, dayPrefix);
        if (seq != null && seq > max) max = seq;
      }
      return max;
    },
  });
}

export {
  allocateDocumentNumber,
  parseDocumentSeq,
  formatDocumentNumber,
  formatDayKey,
} from './allocate-document-number';
