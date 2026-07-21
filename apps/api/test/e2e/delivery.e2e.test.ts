import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../helpers/app-test.helper.js';
import { authHeader, bootstrapDirector, loginAndGetToken } from '../helpers/auth-test.helper.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runE2E = Boolean(DATABASE_URL) && process.env.SKIP_E2E !== '1';

test('e2e delivery create + board smoke', { skip: !runE2E }, async () => {
  const auth = await bootstrapDirector();
  const app = await createApp();
  const server = app.getHttpServer();
  const token = await loginAndGetToken(app, auth.login, auth.password, auth.organizationId);
  const headers = authHeader(token);
  const storeBase = `/api/v1/organizations/${auth.organizationId}/stores/${auth.storeId}`;

  const order = await request(server)
    .post(`${storeBase}/orders`)
    .set(headers)
    .send({
      warehouseId: auth.warehouseId,
      type: 'DELIVERY',
      occasion: 'OTHER',
      recipientName: 'Recipient',
      recipientPhone: '+375291000000',
      plannedPrice: '50.00',
    })
    .expect(201);

  const start = new Date();
  start.setHours(start.getHours() + 3);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const delivery = await request(server)
    .post(`${storeBase}/orders/${order.body.id}/delivery`)
    .set(headers)
    .send({
      method: 'OWN_COURIER',
      deliveryDate: start.toISOString().slice(0, 10),
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      addressLine: 'Test st 1',
      city: 'Minsk',
      deliveryFee: '5.00',
    })
    .expect(201);

  assert.ok(delivery.body.id);
  assert.equal(delivery.body.status, 'DRAFT');

  const board = await request(server)
    .get(`${storeBase}/delivery-board`)
    .query({ date: start.toISOString().slice(0, 10) })
    .set(headers)
    .expect(200);

  assert.ok(board.body.sections);

  await app.close();
});
