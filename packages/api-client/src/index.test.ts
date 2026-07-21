import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClientError, createApiClient } from './index.js';

test('createApiClient propagates structured API errors', async () => {
  const client = createApiClient({
    baseUrl: 'http://example.test/api/v1',
    getRequestId: () => 'fixed-id',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'NOT_READY',
            message: 'database down',
            details: [],
            requestId: 'srv-1',
          },
        }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      ),
  });

  await assert.rejects(
    () => client.getReadyHealth(),
    (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.code, 'NOT_READY');
      assert.equal(error.requestId, 'srv-1');
      return true;
    },
  );
});
