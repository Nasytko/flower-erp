import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiErrorBody } from '@flower/contracts';

test('api error contract shape used by filter', () => {
  const body = createApiErrorBody({
    code: 'INTERNAL_ERROR',
    message: 'Unexpected server error',
    requestId: 'test',
  });
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.ok(Array.isArray(body.error.details));
});
