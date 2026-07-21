import assert from 'node:assert/strict';
import test from 'node:test';
import { loadApiEnv } from './api.js';

test('loadApiEnv fails without DATABASE_URL', () => {
  assert.throws(
    () =>
      loadApiEnv({
        NODE_ENV: 'test',
        JWT_ACCESS_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
      }),
    /DATABASE_URL/,
  );
});

test('loadApiEnv parses CORS and port', () => {
  const env = loadApiEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/flower',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    PORT: '4000',
    CORS_ORIGINS: 'http://a.local, http://b.local',
  });
  assert.equal(env.PORT, 4000);
  assert.deepEqual(env.CORS_ORIGINS, ['http://a.local', 'http://b.local']);
});
