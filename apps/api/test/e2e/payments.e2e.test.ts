import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../helpers/app-test.helper.js';
import { authHeader, bootstrapDirector, loginAndGetToken } from '../helpers/auth-test.helper.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runE2E = Boolean(DATABASE_URL) && process.env.SKIP_E2E !== '1';

test('e2e payment methods ensure + order prepayment draft/complete/summary', {
  skip: !runE2E,
}, async () => {
  const auth = await bootstrapDirector();
  const app = await createApp();
  const server = app.getHttpServer();
  const token = await loginAndGetToken(app, auth.login, auth.password, auth.organizationId);
  const headers = authHeader(token);
  const base = `/api/v1/organizations/${auth.organizationId}`;
  const storeBase = `${base}/stores/${auth.storeId}`;
  const suffix = Date.now().toString().slice(-6);

  const methods = await request(server)
    .post(`${storeBase}/payment-methods/ensure-defaults`)
    .set(headers)
    .expect(201);
  assert.ok(Array.isArray(methods.body));
  const cash = methods.body.find((row: { code: string }) => row.code === 'CASH');
  assert.ok(cash);

  const customer = await request(server)
    .post(`${base}/customers`)
    .set(headers)
    .send({ name: 'Pay Client', phone: `+37533${suffix}` })
    .expect(201);
  const cat = await request(server)
    .post(`${base}/categories`)
    .set(headers)
    .send({ name: 'Cat', code: `PC${suffix}` })
    .expect(201);
  const unit = await request(server)
    .post(`${base}/units`)
    .set(headers)
    .send({ name: 'шт', symbol: `q${suffix.slice(-2)}`, quantityScale: 0 })
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
      name: 'Ribbon',
      code: `RB${suffix}`,
      itemType: 'MATERIAL',
      isPurchasable: true,
      isSellable: true,
    })
    .expect(201);

  const order = await request(server)
    .post(`${storeBase}/orders`)
    .set(headers)
    .send({
      warehouseId: auth.warehouseId,
      type: 'PICKUP',
      customerId: customer.body.id,
      occasion: 'OTHER',
      plannedPrice: '80.00',
    })
    .expect(201);
  await request(server)
    .post(`${storeBase}/orders/${order.body.id}/composition/items`)
    .set(headers)
    .send({ itemId: item.body.id, plannedQuantity: '1' })
    .expect(201);
  await request(server)
    .post(`${storeBase}/orders/${order.body.id}/confirm`)
    .set(headers)
    .expect(201);

  const draft = await request(server)
    .post(`${storeBase}/orders/${order.body.id}/payments`)
    .set(headers)
    .send({ methodId: cash.id, amount: '30.00' })
    .expect(201);
  assert.equal(draft.body.status, 'DRAFT');
  assert.equal(draft.body.amount, '30.00');

  const completed = await request(server)
    .post(`${storeBase}/payments/${draft.body.id}/complete`)
    .set(headers)
    .set('Idempotency-Key', `e2e-pay-${suffix}`)
    .expect(201);
  assert.equal(completed.body.status, 'COMPLETED');

  const summary = await request(server)
    .get(`${storeBase}/orders/${order.body.id}/payment-summary`)
    .set(headers)
    .expect(200);
  assert.equal(summary.body.paidAmount, '30.00');
  assert.equal(summary.body.balanceDue, '50.00');
  assert.equal(summary.body.status, 'PARTIALLY_PAID');

  await app.close();
});
