import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLogin,
  assertStoreInScope,
  computeLockUntil,
  normalizeLogin,
} from '../../src/modules/identity/domain/identity-rules.js';
import { redactInventoryBatch } from '../../src/modules/inventory/presentation/inventory.presenter.js';
import { Argon2PasswordService, hashRefreshToken } from '../../src/infrastructure/security/password.service.js';

test('login normalization', () => {
  assert.equal(normalizeLogin('  AbC.User '), 'abc.user');
  assert.throws(() => assertLogin('ab'));
});

test('store scope', () => {
  assert.doesNotThrow(() => assertStoreInScope({ mode: 'ALL_STORES', storeIds: [] }, 'any'));
  assert.throws(() =>
    assertStoreInScope({ mode: 'SELECTED_STORES', storeIds: ['a'] }, 'b'),
  );
});

test('lockout computation', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(computeLockUntil(4, 5, 15, now), null);
  const locked = computeLockUntil(5, 5, 15, now);
  assert.ok(locked);
  assert.equal(locked!.getTime(), now.getTime() + 15 * 60_000);
});

test('cost redaction omits field', () => {
  const withCost = redactInventoryBatch({ id: '1', unitCost: '10' }, false);
  assert.equal('unitCost' in withCost, false);
  const visible = redactInventoryBatch({ id: '1', unitCost: '10' }, true);
  assert.equal(visible.unitCost, '10');
});

test('refresh token hashing is stable', () => {
  const a = hashRefreshToken('secret', 'token');
  const b = hashRefreshToken('secret', 'token');
  assert.equal(a, b);
  assert.notEqual(a, hashRefreshToken('secret', 'other'));
});

test('argon2 verify', async () => {
  const svc = new Argon2PasswordService();
  const hash = await svc.hash('Password123!');
  assert.equal(await svc.verify(hash, 'Password123!'), true);
  assert.equal(await svc.verify(hash, 'wrong'), false);
});
