import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateDocumentNumber,
  formatDayKey,
  formatDocumentNumber,
  parseDocumentSeq,
} from '../../src/infrastructure/ids/allocate-document-number.js';

test('document number format PREFIX-YYYYMMDD-0001', () => {
  const date = new Date('2026-07-24T12:00:00.000Z');
  // Use local components via formatDayKey — assert structure
  const number = formatDocumentNumber('ORD', date, 3);
  assert.match(number, /^ORD-\d{8}-0003$/);
  assert.equal(formatDayKey(date).length, 8);
});

test('allocateDocumentNumber increments until free', async () => {
  const taken = new Set(['PRI-20260724-0001', 'PRI-20260724-0002']);
  const date = new Date(2026, 6, 24); // local Jul 24, 2026
  const number = await allocateDocumentNumber(
    'PRI',
    async (candidate) => taken.has(candidate),
    {
      now: date,
      maxSeqForDay: async () => 2,
    },
  );
  assert.equal(number, `PRI-${formatDayKey(date)}-0003`);
});

test('parseDocumentSeq reads trailing counter', () => {
  assert.equal(parseDocumentSeq('ITM-20260724-0012', 'ITM-20260724-'), 12);
  assert.equal(parseDocumentSeq('ITM-20260724-x', 'ITM-20260724-'), null);
});
