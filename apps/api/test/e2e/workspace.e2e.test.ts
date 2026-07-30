import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../helpers/app-test.helper.js';
import { authHeader, bootstrapDirector, loginAndGetToken } from '../helpers/auth-test.helper.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runE2E = Boolean(DATABASE_URL) && process.env.SKIP_E2E !== '1';

test('e2e workspace orders list and operations board', { skip: !runE2E }, async () => {
  const auth = await bootstrapDirector();
  const app = await createApp();
  const server = app.getHttpServer();
  const token = await loginAndGetToken(app, auth.login, auth.password, auth.organizationId);
  const headers = authHeader(token);
  const storeBase = `/api/v1/organizations/${auth.organizationId}/stores/${auth.storeId}`;

  const orders = await request(server)
    .get(`${storeBase}/workspace/orders?filter=all_open&limit=5`)
    .set(headers)
    .expect(200);

  assert.ok(typeof orders.body.serverNow === 'string');
  assert.equal(orders.body.filter, 'all_open');
  assert.ok(Array.isArray(orders.body.items));

  const ops = await request(server)
    .get(`${storeBase}/operations`)
    .set(headers)
    .expect(200);
  assert.ok(ops.body.kpis);
  assert.ok(typeof ops.body.kpis.ordersToday === 'number');

  await app.close();
});
