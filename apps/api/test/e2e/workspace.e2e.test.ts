import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../helpers/app-test.helper.js';
import { authHeader, bootstrapDirector, loginAndGetToken } from '../helpers/auth-test.helper.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runE2E = Boolean(DATABASE_URL) && process.env.SKIP_E2E !== '1';

test('e2e workspace today returns serverNow and counters', { skip: !runE2E }, async () => {
  const auth = await bootstrapDirector();
  const app = await createApp();
  const server = app.getHttpServer();
  const token = await loginAndGetToken(app, auth.login, auth.password, auth.organizationId);
  const headers = authHeader(token);
  const storeBase = `/api/v1/organizations/${auth.organizationId}/stores/${auth.storeId}`;

  const today = await request(server)
    .get(`${storeBase}/workspace/today`)
    .set(headers)
    .expect(200);

  assert.ok(typeof today.body.serverNow === 'string');
  assert.ok(today.body.counters);
  assert.ok(typeof today.body.counters.overdue.count === 'number');
  assert.equal(today.body.counters.overdue.filterLink, 'overdue');
  assert.ok(Array.isArray(today.body.attentionItems));
  assert.ok(Array.isArray(today.body.lowStockWarnings));
  assert.ok(Array.isArray(today.body.quickActions));
  assert.ok(today.body.sections);

  const ops = await request(server)
    .get(`${storeBase}/operations`)
    .set(headers)
    .expect(200);
  assert.ok(ops.body.kpis);
  assert.ok(typeof ops.body.kpis.ordersToday === 'number');

  await app.close();
});
