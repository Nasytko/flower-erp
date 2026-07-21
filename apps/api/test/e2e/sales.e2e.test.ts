import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../helpers/app-test.helper.js';
import { authHeader, bootstrapDirector, loginAndGetToken } from '../helpers/auth-test.helper.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runE2E = Boolean(DATABASE_URL) && process.env.SKIP_E2E !== '1';

test('e2e direct sale create + list', { skip: !runE2E }, async () => {
  const auth = await bootstrapDirector();
  const app = await createApp();
  const server = app.getHttpServer();
  const token = await loginAndGetToken(app, auth.login, auth.password, auth.organizationId);
  const headers = authHeader(token);
  const base = `/api/v1/organizations/${auth.organizationId}/stores/${auth.storeId}`;
  const suffix = Date.now().toString().slice(-6);

  const cat = await request(server)
    .post(`/api/v1/organizations/${auth.organizationId}/categories`)
    .set(headers)
    .send({ name: 'Cat', code: `SC${suffix}` })
    .expect(201);
  const unit = await request(server)
    .post(`/api/v1/organizations/${auth.organizationId}/units`)
    .set(headers)
    .send({ name: 'шт', symbol: `s${suffix.slice(-2)}`, quantityScale: 0 })
    .expect(201);
  const policy = await request(server)
    .post(`/api/v1/organizations/${auth.organizationId}/policies`)
    .set(headers)
    .send({
      name: 'Mat',
      itemType: 'MATERIAL',
      trackingMethod: 'NONE',
      expirationTracking: false,
    })
    .expect(201);
  const item = await request(server)
    .post(`/api/v1/organizations/${auth.organizationId}/items`)
    .set(headers)
    .send({
      categoryId: cat.body.id,
      unitId: unit.body.id,
      inventoryPolicyId: policy.body.id,
      name: 'Ribbon',
      code: `RB${suffix}`,
      itemType: 'MATERIAL',
      isPurchasable: true,
      isSellable: true,
    })
    .expect(201);

  // Without stock, create draft may succeed but complete should fail — just create draft list
  const sale = await request(server)
    .post(`${base}/sales/direct`)
    .set(headers)
    .send({
      warehouseId: auth.warehouseId,
      salesChannel: 'STORE',
      lines: [{ itemId: item.body.id, quantity: '1', unitPrice: '15.00', description: 'Ribbon' }],
    })
    .expect(201);

  assert.equal(sale.body.status, 'DRAFT');
  assert.equal(sale.body.costAmount, undefined);

  const list = await request(server).get(`${base}/sales`).set(headers).expect(200);
  assert.ok(Array.isArray(list.body));
  assert.ok(list.body.some((s: { id: string }) => s.id === sale.body.id));

  await app.close();
});
