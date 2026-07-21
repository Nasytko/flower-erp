import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../helpers/app-test.helper.js';
import { authHeader, bootstrapDirector, loginAndGetToken } from '../helpers/auth-test.helper.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runE2E = Boolean(DATABASE_URL) && process.env.SKIP_E2E !== '1';

test('e2e master-data create/filter/paginate/search', { skip: !runE2E }, async () => {
  const auth = await bootstrapDirector();
  const app = await createApp();
  const server = app.getHttpServer();
  const token = await loginAndGetToken(app, auth.login, auth.password, auth.organizationId);
  const headers = authHeader(token);
  const suffix = Date.now().toString().slice(-6);
  const base = `/api/v1/organizations/${auth.organizationId}`;

  await request(server)
    .post(`${base}/suppliers`)
    .set(headers)
    .send({ name: 'Supplier A', code: `SA-${suffix}` })
    .expect(201);

  const cat = await request(server)
    .post(`${base}/categories`)
    .set(headers)
    .send({ name: 'Категория', code: `CAT-${suffix}` })
    .expect(201);

  const unit = await request(server)
    .post(`${base}/units`)
    .set(headers)
    .send({ name: 'Штука', symbol: `шт${suffix.slice(-2)}`, quantityScale: 0 })
    .expect(201);

  const policy = await request(server)
    .post(`${base}/policies`)
    .set(headers)
    .send({
      name: 'Flower policy',
      itemType: 'FLOWER',
      trackingMethod: 'LOT',
      expirationTracking: true,
      defaultShelfLifeDays: 5,
    })
    .expect(201);

  await request(server)
    .post(`${base}/items`)
    .set(headers)
    .send({
      categoryId: cat.body.id,
      unitId: unit.body.id,
      inventoryPolicyId: policy.body.id,
      name: 'Rosa Red',
      code: `ROSE-${suffix}`,
      itemType: 'FLOWER',
    })
    .expect(201);

  await request(server)
    .post(`${base}/items`)
    .set(headers)
    .send({
      categoryId: cat.body.id,
      unitId: unit.body.id,
      inventoryPolicyId: policy.body.id,
      name: 'Rosa White',
      code: `ROSW-${suffix}`,
      itemType: 'FLOWER',
    })
    .expect(201);

  const listed = await request(server)
    .get(`${base}/items`)
    .set(headers)
    .query({ name: 'Rosa', page: 1, pageSize: 1, sortBy: 'name', sortDir: 'asc' })
    .expect(200);

  assert.equal(listed.body.pageSize, 1);
  assert.ok(listed.body.totalItems >= 2);

  await app.close();
});
