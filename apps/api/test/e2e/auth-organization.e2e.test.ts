import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../helpers/app-test.helper.js';
import { bootstrapDirector, loginAndGetToken, authHeader } from '../helpers/auth-test.helper.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runE2E = Boolean(DATABASE_URL) && process.env.SKIP_E2E !== '1';

test('e2e organization → store → warehouse with auth', { skip: !runE2E }, async () => {
  const auth = await bootstrapDirector();
  const app = await createApp();
  const server = app.getHttpServer();
  const token = await loginAndGetToken(app, auth.login, auth.password, auth.organizationId);

  await request(server).get('/api/v1/organizations').set(authHeader(token)).expect(200);

  const storeRes = await request(server)
    .post(`/api/v1/organizations/${auth.organizationId}/stores`)
    .set(authHeader(token))
    .send({ name: 'E2E Store 2', code: `E${Date.now().toString().slice(-5)}` })
    .expect(201);

  assert.equal(storeRes.body.warehouse.isDefault, true);
  const storeId = storeRes.body.store.id as string;
  const warehouseId = storeRes.body.warehouse.id as string;

  await request(server)
    .get(`/api/v1/organizations/${auth.organizationId}`)
    .set(authHeader(token))
    .expect(200);

  await request(server)
    .get(`/api/v1/organizations/${auth.organizationId}/stores/${storeId}/warehouses/${warehouseId}`)
    .set(authHeader(token))
    .expect(200);

  await app.close();
});

test('e2e unauthenticated request rejected', { skip: !runE2E }, async () => {
  const app = await createApp();
  const server = app.getHttpServer();
  await request(server).get('/api/v1/organizations').expect(401);
  await app.close();
});
