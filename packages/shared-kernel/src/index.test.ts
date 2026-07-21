import assert from 'node:assert/strict';
import test from 'node:test';
import { brandId, err, isValidDateRange, ok } from './index.js';

test('Result helpers', () => {
  assert.equal(ok(1).ok, true);
  assert.equal(err(new Error('x')).ok, false);
});

test('brandId returns branded string', () => {
  const id = brandId<'OrganizationId'>('org-1');
  assert.equal(id, 'org-1');
});

test('isValidDateRange', () => {
  const from = new Date('2026-01-01');
  const to = new Date('2026-01-02');
  assert.equal(isValidDateRange({ from, to }), true);
  assert.equal(isValidDateRange({ from: to, to: from }), false);
});
