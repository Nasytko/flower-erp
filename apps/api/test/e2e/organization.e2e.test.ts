import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../helpers/app-test.helper.js';
import { bootstrapDirector, loginAndGetToken, authHeader } from '../helpers/auth-test.helper.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runE2E = Boolean(DATABASE_URL) && process.env.SKIP_E2E !== '1';

test('e2e organization → store → warehouse → list/get', { skip: !runE2E }, async () => {
  const auth = await bootstrapDirector();
  const app = await createApp();
  const server = app.getHttpServer();
  const token = await loginAndGetToken(app, auth.login, auth.password, auth.organizationId);

  await request(server).get(`/api/v1/organizations/${auth.organizationId}`).set(authHeader(token)).expect(200);
  await request(server)
    .get(`/api/v1/organizations/${auth.organizationId}/stores`)
    .set(authHeader(token))
    .expect(200);
  await request(server)
    .get(`/api/v1/organizations/${auth.organizationId}/stores/${auth.storeId}`)
    .set(authHeader(token))
    .expect(200);
  const wh = await request(server)
    .get(`/api/v1/organizations/${auth.organizationId}/stores/${auth.storeId}/warehouses`)
    .set(authHeader(token))
    .expect(200);
  assert.ok(Array.isArray(wh.body));
  await request(server)
    .get(
      `/api/v1/organizations/${auth.organizationId}/stores/${auth.storeId}/warehouses/${auth.warehouseId}`,
    )
    .set(authHeader(token))
    .expect(200);

  await app.close();
});

test('e2e invalid uuid and tenancy mismatch', { skip: !runE2E }, async () => {
  const authA = await bootstrapDirector();
  const authB = await bootstrapDirector();
  const app = await createApp();
  const server = app.getHttpServer();
  const tokenB = await loginAndGetToken(app, authB.login, authB.password, authB.organizationId);

  await request(server).get('/api/v1/organizations/not-a-uuid').set(authHeader(tokenB)).expect(400);

  await request(server)
    .get(`/api/v1/organizations/${authB.organizationId}/stores/${authA.storeId}`)
    .set(authHeader(tokenB))
    .expect(404);

  await app.close();
});
