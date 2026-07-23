import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEmailFormat,
  deriveLoginFromEmail,
  deriveStoreCode,
  normalizeEmail,
  parseCliArgs,
  redactSecrets,
} from '../../src/scripts/create-initial-director.helpers.js';

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Paul@Example.COM '), 'paul@example.com');
});

test('assertEmailFormat rejects invalid', () => {
  assert.throws(() => assertEmailFormat('not-an-email'));
  assert.doesNotThrow(() => assertEmailFormat('paulnasytko@gmail.com'));
});

test('deriveLoginFromEmail matches login charset', () => {
  assert.equal(deriveLoginFromEmail('paulnasytko@gmail.com'), 'paulnasytko');
  assert.equal(deriveLoginFromEmail('A.B-C_d@x.com'), 'a.b-c_d');
  const short = deriveLoginFromEmail('ab@x.com');
  assert.ok(short.length >= 3);
  assert.match(short, /^[a-z0-9][a-z0-9._-]{2,63}$/);
});

test('deriveStoreCode produces valid store codes', () => {
  const code = deriveStoreCode('БУКЕТ №1 — Янки Купалы');
  assert.match(code, /^[A-Z0-9][A-Z0-9_-]{1,31}$/);
  assert.equal(deriveStoreCode('Main Store').length >= 2, true);
});

test('parseCliArgs detects allow-existing-system', () => {
  assert.equal(parseCliArgs(['--allow-existing-system']).allowExistingSystem, true);
  assert.equal(parseCliArgs([]).allowExistingSystem, false);
});

test('redactSecrets removes password fragments from messages', () => {
  const out = redactSecrets('failed with SuperSecret99!', ['SuperSecret99!']);
  assert.equal(out.includes('SuperSecret99!'), false);
  assert.ok(out.includes('[REDACTED]'));
});
