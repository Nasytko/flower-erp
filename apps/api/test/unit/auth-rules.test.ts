import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidTotpCodeFormat,
  normalizeTotpCode,
  TOTP_INVALID,
  TOTP_REQUIRED,
} from '../../src/modules/auth/domain/auth-rules.js';

test('normalizeTotpCode strips whitespace', () => {
  assert.equal(normalizeTotpCode('123 456'), '123456');
  assert.equal(normalizeTotpCode(' 123456 '), '123456');
});

test('isValidTotpCodeFormat accepts six digits only', () => {
  assert.equal(isValidTotpCodeFormat('123456'), true);
  assert.equal(isValidTotpCodeFormat('12345'), false);
  assert.equal(isValidTotpCodeFormat('1234567'), false);
  assert.equal(isValidTotpCodeFormat('12a456'), false);
});

test('TOTP error constants', () => {
  assert.equal(TOTP_REQUIRED.code, 'TOTP_REQUIRED');
  assert.equal(TOTP_INVALID.code, 'TOTP_INVALID');
});
