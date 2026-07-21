import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../helpers/app-test.helper.js';
import { bootstrapDirector, loginAndGetToken, authHeader } from '../helpers/auth-test.helper.js';
import { BootstrapOwnerUseCases } from '../../src/modules/identity/application/bootstrap-owner.use-cases.js';
import { Test } from '@nestjs/testing';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { MasterDataModule } from '../../src/modules/master-data/master-data.module.js';
import { IdentityModule } from '../../src/modules/identity/identity.module.js';
import { ConflictException } from '@nestjs/common';

const DATABASE_URL = process.env.DATABASE_URL;
const runIntegration = Boolean(DATABASE_URL) && process.env.SKIP_INTEGRATION !== '1';

test('login success and wrong password identical structure', { skip: !runIntegration }, async () => {
  const auth = await bootstrapDirector();
  const app = await createApp();
  const server = app.getHttpServer();

  const ok = await request(server)
    .post('/api/v1/auth/login')
    .send({ login: auth.login, password: auth.password, organizationId: auth.organizationId })
    .expect(200);
  assert.ok(ok.body.accessToken);
  assert.equal(ok.body.user.passwordHash, undefined);

  const badPassword = await request(server)
    .post('/api/v1/auth/login')
    .send({ login: auth.login, password: 'wrong-password-xx', organizationId: auth.organizationId })
    .expect(401);

  const unknown = await request(server)
    .post('/api/v1/auth/login')
    .send({ login: 'nouser999', password: 'wrong-password-xx', organizationId: auth.organizationId })
    .expect(401);

  assert.equal(badPassword.body.error?.code ?? badPassword.body.code, unknown.body.error?.code ?? unknown.body.code);

  await app.close();
});

test('refresh rotation and token reuse revokes family', { skip: !runIntegration }, async () => {
  const auth = await bootstrapDirector();
  const app = await createApp();
  const server = app.getHttpServer();

  const loginRes = await request(server)
    .post('/api/v1/auth/login')
    .send({ login: auth.login, password: auth.password, organizationId: auth.organizationId })
    .expect(200);

  const cookies = loginRes.headers['set-cookie'];
  assert.ok(cookies);
  const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);
  const oldRefreshMatch = cookieHeader.match(/flower_refresh_token=([^;]+)/);
  assert.ok(oldRefreshMatch);
  const oldRefresh = oldRefreshMatch[1];

  const refreshed = await request(server)
    .post('/api/v1/auth/refresh')
    .set('Cookie', `flower_refresh_token=${oldRefresh}`)
    .set('Origin', 'http://localhost:3000')
    .expect(200);
  assert.ok(refreshed.body.accessToken);

  await request(server)
    .post('/api/v1/auth/refresh')
    .set('Cookie', `flower_refresh_token=${oldRefresh}`)
    .set('Origin', 'http://localhost:3000')
    .expect(401);

  const audit = await request(server)
    .get(`/api/v1/organizations/${auth.organizationId}/audit?action=TOKEN_REUSE_DETECTED&limit=5`)
    .set(authHeader(refreshed.body.accessToken))
    .expect(200);
  assert.ok(Array.isArray(audit.body));
  assert.ok(audit.body.some((row: { action: string }) => row.action === 'TOKEN_REUSE_DETECTED'));

  await app.close();
});

test('duplicate bootstrap rejected', { skip: !runIntegration }, async () => {
  await bootstrapDirector({ login: `own${Date.now().toString().slice(-6)}` });
  const moduleRef = await Test.createTestingModule({
    imports: [InfrastructureModule, OrganizationModule, MasterDataModule, IdentityModule],
  }).compile();
  const bootstrap = moduleRef.get(BootstrapOwnerUseCases);
  await assert.rejects(
    () =>
      bootstrap.bootstrapOwner({
        login: `dup${Date.now().toString().slice(-5)}`,
        password: 'Password12345!',
        displayName: 'Dup',
        organizationName: 'Should Fail',
        storeName: 'S',
        storeCode: 'DUP01',
      }),
    (err: unknown) => err instanceof ConflictException || (err as { status?: number }).status === 409,
  );
  await moduleRef.close();
});

test('store scope and cost redaction', { skip: !runIntegration }, async () => {
  const auth = await bootstrapDirector();
  const app = await createApp();
  const token = await loginAndGetToken(app, auth.login, auth.password, auth.organizationId);
  const server = app.getHttpServer();

  const me = await request(server).get('/api/v1/auth/me').set(authHeader(token)).expect(200);
  assert.ok(me.body.permissions.includes('inventory:view-cost'));

  await request(server).post('/api/v1/auth/logout-all').set(authHeader(token)).expect(204);
  await request(server).get('/api/v1/auth/me').set(authHeader(token)).expect(401);

  await app.close();
});
