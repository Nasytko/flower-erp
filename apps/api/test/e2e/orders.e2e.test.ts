import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../helpers/app-test.helper.js';
import { authHeader, bootstrapDirector, loginAndGetToken } from '../helpers/auth-test.helper.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runE2E = Boolean(DATABASE_URL) && process.env.SKIP_E2E !== '1';

test('e2e customer order draft → composition → confirm → dashboard', { skip: !runE2E }, async () => {
  const auth = await bootstrapDirector();
  const app = await createApp();
  const server = app.getHttpServer();
  const token = await loginAndGetToken(app, auth.login, auth.password, auth.organizationId);
  const headers = authHeader(token);
  const base = `/api/v1/organizations/${auth.organizationId}`;
  const storeBase = `${base}/stores/${auth.storeId}`;
  const suffix = Date.now().toString().slice(-6);

  const customer = await request(server)
    .post(`${base}/customers`)
    .set(headers)
    .send({ name: 'Client', phone: `+7911${suffix}` })
    .expect(201);

  const cat = await request(server)
    .post(`${base}/categories`)
    .set(headers)
    .send({ name: 'Cat', code: `OC${suffix}` })
    .expect(201);
  const unit = await request(server)
    .post(`${base}/units`)
    .set(headers)
    .send({ name: 'шт', symbol: `z${suffix.slice(-2)}`, quantityScale: 0 })
    .expect(201);
  const policy = await request(server)
    .post(`${base}/policies`)
    .set(headers)
    .send({
      name: 'Mat',
      itemType: 'MATERIAL',
      trackingMethod: 'NONE',
      expirationTracking: false,
    })
    .expect(201);
  const item = await request(server)
    .post(`${base}/items`)
    .set(headers)
    .send({
      categoryId: cat.body.id,
      unitId: unit.body.id,
      inventoryPolicyId: policy.body.id,
      name: 'Paper',
      code: `P${suffix}`,
      itemType: 'MATERIAL',
      isPurchasable: true,
    })
    .expect(201);

  const order = await request(server)
    .post(`${storeBase}/orders`)
    .set(headers)
    .send({
      warehouseId: auth.warehouseId,
      type: 'PICKUP',
      customerId: customer.body.id,
      occasion: 'BIRTHDAY',
    })
    .expect(201);

  await request(server)
    .post(`${storeBase}/orders/${order.body.id}/composition/items`)
    .set(headers)
    .send({ itemId: item.body.id, plannedQuantity: '2' })
    .expect(201);

  const confirmed = await request(server)
    .post(`${storeBase}/orders/${order.body.id}/confirm`)
    .set(headers)
    .expect(201);
  assert.ok(['CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED'].includes(confirmed.body.status));

  const detail = await request(server)
    .get(`${storeBase}/orders/${order.body.id}`)
    .set(headers)
    .expect(200);
  assert.ok(detail.body.timeline?.length >= 1);

  const dash = await request(server).get(`${storeBase}/orders/dashboard`).set(headers).expect(200);
  assert.ok(Array.isArray(dash.body.partiallyReserved));
  assert.ok(Array.isArray(dash.body.unassigned));

  await app.close();
});
