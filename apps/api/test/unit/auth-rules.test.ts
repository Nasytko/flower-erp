import assert from 'node:assert/strict';
import test from 'node:test';
import {
  matchesRoleChallenge,
  normalizeRoleChallenge,
  ROLE_CHALLENGE_KEYWORDS,
} from '../../src/modules/auth/domain/auth-rules.js';

test('role challenge normalization', () => {
  assert.equal(normalizeRoleChallenge('  Florist '), 'florist');
  assert.equal(normalizeRoleChallenge('COURIER'), 'courier');
});

test('role challenge matches assigned system roles', () => {
  assert.equal(matchesRoleChallenge(['FLORIST'], 'florist'), true);
  assert.equal(matchesRoleChallenge(['FLORIST'], 'director'), false);
  assert.equal(matchesRoleChallenge(['DIRECTOR', 'FLORIST'], 'florist'), true);
  assert.equal(matchesRoleChallenge(['COURIER'], ROLE_CHALLENGE_KEYWORDS.COURIER), true);
  assert.equal(matchesRoleChallenge([], 'florist'), false);
});
