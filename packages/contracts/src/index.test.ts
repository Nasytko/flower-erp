import assert from 'node:assert/strict';
import test from 'node:test';
import { API_PREFIX, createApiErrorBody } from './index.js';

test('API_PREFIX is api/v1', () => {
  assert.equal(API_PREFIX, 'api/v1');
});

test('createApiErrorBody defaults details to empty array', () => {
  const body = createApiErrorBody({
    code: 'TEST',
    message: 'msg',
    requestId: 'req-1',
  });
  assert.deepEqual(body.error.details, []);
});
