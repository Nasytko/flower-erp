import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatAuditDiffLines,
  getAuditContextLabel,
  pickChangedAuditFields,
} from './audit-ui';

test('pickChangedAuditFields keeps only differing keys', () => {
  const result = pickChangedAuditFields(
    {
      id: '1',
      comment: 'old',
      receivedDate: '2026-07-01',
      status: 'OPEN',
    },
    {
      id: '1',
      comment: 'new',
      receivedDate: '2026-07-01',
      status: 'OPEN',
    },
  );

  assert.deepEqual(result.before, { comment: 'old' });
  assert.deepEqual(result.after, { comment: 'new' });
});

test('formatAuditDiffLines renders single-field update', () => {
  const lines = formatAuditDiffLines(
    { quantity: '5', itemName: 'Rose' },
    { quantity: '10', itemName: 'Rose' },
  );
  assert.deepEqual(lines, ['Кол-во: 5 → 10']);
});

test('getAuditContextLabel shows item name when only qty changed', () => {
  const label = getAuditContextLabel(
    { itemName: 'Роза', quantity: '5' },
    { itemName: 'Роза', quantity: '10' },
  );
  assert.equal(label, 'Роза');
});

test('formatAuditDiffLines lists all fields on create', () => {
  const lines = formatAuditDiffLines(null, {
    number: 'SUP-1',
    status: 'SUBMITTED_TO_SUPPLIER',
    itemCount: 0,
  });
  assert.ok(lines.some((line) => line.startsWith('Номер:')));
  assert.ok(lines.some((line) => line.startsWith('Статус:')));
});
