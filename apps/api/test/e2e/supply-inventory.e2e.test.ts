import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../helpers/app-test.helper.js';
import { authHeader, bootstrapDirector, loginAndGetToken } from '../helpers/auth-test.helper.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runE2E = Boolean(DATABASE_URL) && process.env.SKIP_E2E !== '1';

test('e2e master-data → supply → post → inventory', { skip: !runE2E }, async () => {
  const auth = await bootstrapDirector();
  const app = await createApp();
  const server = app.getHttpServer();
  const token = await loginAndGetToken(app, auth.login, auth.password, auth.organizationId);
  const headers = authHeader(token);
  const suffix = Date.now().toString().slice(-6);
  const organizationId = auth.organizationId;
  const storeId = auth.storeId;
  const warehouseId = auth.warehouseId;
  const base = `/api/v1/organizations/${organizationId}`;

  const cat = await request(server)
    .post(`${base}/categories`)
    .set(headers)
    .send({ name: 'Cat', code: `C${suffix}` })
    .expect(201);
  const unit = await request(server)
    .post(`${base}/units`)
    .set(headers)
    .send({ name: 'шт', symbol: `s${suffix.slice(-2)}`, quantityScale: 0 })
    .expect(201);
  const policy = await request(server)
    .post(`${base}/policies`)
    .set(headers)
    .send({
      name: 'Flower',
      itemType: 'FLOWER',
      trackingMethod: 'LOT',
      expirationTracking: true,
      defaultShelfLifeDays: 3,
    })
    .expect(201);
  const item = await request(server)
    .post(`${base}/items`)
    .set(headers)
    .send({
      categoryId: cat.body.id,
      unitId: unit.body.id,
      inventoryPolicyId: policy.body.id,
      name: 'Rose',
      code: `I${suffix}`,
      itemType: 'FLOWER',
      isPurchasable: true,
    })
    .expect(201);
  const supplier = await request(server)
    .post(`${base}/suppliers`)
    .set(headers)
    .send({ name: 'Supplier', code: `P${suffix}` })
    .expect(201);

  const storeBase = `${base}/stores/${storeId}`;
  const supply = await request(server)
    .post(`${storeBase}/supplies`)
    .set(headers)
    .send({ warehouseId, supplierId: supplier.body.id })
    .expect(201);
  await request(server)
    .post(`${storeBase}/supplies/${supply.body.id}/items`)
    .set(headers)
    .send({ itemId: item.body.id, orderedQuantity: '5' })
    .expect(201);
  await request(server)
    .post(`${storeBase}/supplies/${supply.body.id}/submit`)
    .set(headers)
    .expect(201);

  const receipt = await request(server)
    .post(`${storeBase}/supplies/${supply.body.id}/receipts`)
    .set(headers)
    .send({ receivedAt: new Date().toISOString() })
    .expect(201);
  const supplyGet = await request(server)
    .get(`${storeBase}/supplies/${supply.body.id}`)
    .set(headers)
    .expect(200);
  await request(server)
    .post(`${storeBase}/goods-receipts/${receipt.body.id}/items`)
    .set(headers)
    .send({
      supplyItemId: supplyGet.body.items[0].id,
      receivedQuantity: '5',
      acceptedQuantity: '5',
      defectiveQuantity: '0',
      actualUnitPrice: '50',
    })
    .expect(201);
  await request(server)
    .post(`${storeBase}/goods-receipts/${receipt.body.id}/post`)
    .set({ ...headers, 'Idempotency-Key': `e2e-${suffix}` })
    .expect(201);

  const inv = await request(server)
    .get(`${storeBase}/warehouses/${warehouseId}/inventory`)
    .set(headers)
    .expect(200);
  assert.ok(Array.isArray(inv.body));
  assert.ok(
    inv.body.some(
      (row: { onHandQuantity: string }) =>
        row.onHandQuantity === '5' || row.onHandQuantity === '5.000',
    ),
  );

  await app.close();
});
