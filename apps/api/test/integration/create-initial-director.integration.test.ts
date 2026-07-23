/**
 * Integration coverage for BootstrapOwnerUseCases via the initial-director path.
 * Skipped when DATABASE_URL is unset (same strategy as other integration tests).
 */
import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { MasterDataModule } from '../../src/modules/master-data/master-data.module.js';
import { IdentityModule } from '../../src/modules/identity/identity.module.js';
import { BootstrapOwnerUseCases } from '../../src/modules/identity/application/bootstrap-owner.use-cases.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { Argon2PasswordService } from '../../src/infrastructure/security/password.service.js';
import { createApp } from '../helpers/app-test.helper.js';
import request from 'supertest';
import { deriveLoginFromEmail, deriveStoreCode } from '../../src/scripts/create-initial-director.helpers.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runIntegration = Boolean(DATABASE_URL) && process.env.SKIP_INTEGRATION !== '1';

async function openBootstrapModule() {
  const moduleRef = await Test.createTestingModule({
    imports: [InfrastructureModule, OrganizationModule, MasterDataModule, IdentityModule],
  }).compile();
  const prisma = moduleRef.get(PrismaService);
  await prisma.$connect();
  return { moduleRef, prisma, bootstrap: moduleRef.get(BootstrapOwnerUseCases) };
}

test(
  'initial director creates org/store/user/director/ALL_STORES and can login',
  { skip: !runIntegration },
  async () => {
    const suffix = Date.now().toString().slice(-6);
    const email = `dir${suffix}@example.com`;
    const login = deriveLoginFromEmail(email);
    const password = `Password${suffix}!x`;
    const organizationName = `Org ${suffix}`;
    const storeName = `Store ${suffix}`;
    const storeCode = deriveStoreCode(storeName).slice(0, 24) + suffix.slice(-4);

    const { moduleRef, prisma, bootstrap } = await openBootstrapModule();
    try {
      // Use allowExistingSystem because other integration tests may have created users.
      const result = await bootstrap.bootstrapOwner({
        login,
        password,
        displayName: 'Director Test',
        email,
        organizationName,
        storeName,
        storeCode,
        allowExistingSystem: true,
      });

      assert.ok(result.organizationId);
      assert.ok(result.storeId);
      assert.ok(result.userId);
      assert.equal(result.login, login);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
      assert.equal(user.email, email);
      assert.notEqual(user.passwordHash, password);
      assert.ok(!user.passwordHash.includes(password));

      const hasher = moduleRef.get(Argon2PasswordService);
      assert.equal(await hasher.verify(user.passwordHash, password), true);

      const membership = await prisma.organizationMembership.findFirstOrThrow({
        where: { userId: result.userId, organizationId: result.organizationId },
        include: { roles: { include: { role: true } } },
      });
      assert.equal(membership.storeAccessMode, 'ALL_STORES');
      assert.ok(membership.roles.some((r) => r.role.code === 'DIRECTOR' && r.role.isSystem));

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'BOOTSTRAP_OWNER', entityId: result.userId },
      });
      assert.ok(audit);

      // Duplicate login rejected
      await assert.rejects(
        () =>
          bootstrap.bootstrapOwner({
            login,
            password: 'AnotherPass99!',
            displayName: 'Dup',
            organizationName: `Other ${suffix}`,
            storeName: 'X',
            storeCode: `X${suffix}`,
            allowExistingSystem: true,
          }),
        (err: unknown) => err instanceof ConflictException,
      );

      // Without allowExistingSystem, refuse when users already exist
      await assert.rejects(
        () =>
          bootstrap.bootstrapOwner({
            login: `z${suffix}`,
            password: 'AnotherPass99!',
            displayName: 'Z',
            organizationName: `Z ${suffix}`,
            storeName: 'Z',
            storeCode: `Z${suffix}`,
            allowExistingSystem: false,
          }),
        (err: unknown) => err instanceof ConflictException,
      );
    } finally {
      await prisma.$disconnect();
      await moduleRef.close();
    }

    const app = await createApp();
    try {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ login, password })
        .expect(200);
      assert.ok(loginRes.body.accessToken);
      assert.ok(!JSON.stringify(loginRes.body).includes(password));
      assert.ok(loginRes.body.permissions?.length > 0);

      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(200);
      assert.equal(me.body.user.login, login);
    } finally {
      await app.close();
    }
  },
);
