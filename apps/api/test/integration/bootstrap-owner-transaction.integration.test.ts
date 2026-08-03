/**
 * Integration coverage for BootstrapOwnerUseCases transaction / FK ordering.
 * Requires DATABASE_URL pointing at a migrated PostgreSQL (same as other integration tests).
 */
import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { MasterDataModule } from '../../src/modules/master-data/master-data.module.js';
import { IdentityModule } from '../../src/modules/identity/identity.module.js';
import { BootstrapOwnerUseCases } from '../../src/modules/identity/application/bootstrap-owner.use-cases.js';
import { IDENTITY_REPOSITORY, type IdentityRepository } from '../../src/modules/identity/application/ports/identity.repository.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { Argon2PasswordService } from '../../src/infrastructure/security/password.service.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../src/infrastructure/persistence/unit-of-work.port.js';
import { resolvePrismaClient } from '../../src/infrastructure/persistence/prisma-transaction-context.js';
import { createApp } from '../helpers/app-test.helper.js';
import {
  deriveLoginFromEmail,
  deriveStoreCode,
} from '../../src/scripts/create-initial-director.helpers.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runIntegration = Boolean(DATABASE_URL) && process.env.SKIP_INTEGRATION !== '1';

async function openBootstrapModule() {
  const moduleRef = await Test.createTestingModule({
    imports: [InfrastructureModule, OrganizationModule, MasterDataModule, IdentityModule],
  }).compile();
  const prisma = moduleRef.get(PrismaService);
  await prisma.$connect();
  return {
    moduleRef,
    prisma,
    bootstrap: moduleRef.get(BootstrapOwnerUseCases),
    uow: moduleRef.get<UnitOfWork>(UNIT_OF_WORK),
  };
}

test(
  'bootstrap: organization exists before org-scoped role insert; DIRECTOR + login work',
  { skip: !runIntegration },
  async () => {
    const suffix = Date.now().toString().slice(-6);
    const email = `own${suffix}@example.com`;
    const login = deriveLoginFromEmail(email);
    const password = `Password${suffix}!x`;
    const organizationName = `Bootstrap Org ${suffix}`;
    const storeName = `Bootstrap Store ${suffix}`;
    const storeCode = `${deriveStoreCode(storeName).slice(0, 20)}${suffix}`.slice(0, 32);

    const { moduleRef, prisma, bootstrap } = await openBootstrapModule();
    try {
      const result = await bootstrap.bootstrapOwner({
        login,
        password,
        displayName: 'Owner Director',
        email,
        organizationName,
        storeName,
        storeCode,
        allowExistingSystem: true,
      });

      const org = await prisma.organization.findUniqueOrThrow({
        where: { id: result.organizationId },
      });
      assert.equal(org.name, organizationName);

      const directorRole = await prisma.role.findUniqueOrThrow({
        where: {
          organizationId_code: { organizationId: result.organizationId, code: 'DIRECTOR' },
        },
      });
      assert.equal(directorRole.organizationId, result.organizationId);
      assert.equal(directorRole.isSystem, true);

      const membership = await prisma.organizationMembership.findFirstOrThrow({
        where: { userId: result.userId, organizationId: result.organizationId },
        include: { roles: true },
      });
      assert.equal(membership.storeAccessMode, 'ALL_STORES');
      assert.ok(membership.roles.some((r) => r.roleId === directorRole.id));

      const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
      const hasher = moduleRef.get(Argon2PasswordService);
      assert.equal(await hasher.verify(user.passwordHash, password), true);
      assert.ok(!user.passwordHash.includes(password));

      // Second bootstrap of same login rejected
      await assert.rejects(
        () =>
          bootstrap.bootstrapOwner({
            login,
            password: 'AnotherPass99!',
            displayName: 'Dup',
            organizationName: `Other ${suffix}`,
            storeName: 'Other',
            storeCode: `O${suffix}`,
            allowExistingSystem: true,
          }),
        (err: unknown) => err instanceof ConflictException,
      );

      // Without allowExistingSystem, refuse when users already exist
      await assert.rejects(
        () =>
          bootstrap.bootstrapOwner({
            login: `n${suffix}`,
            password: 'AnotherPass99!',
            displayName: 'N',
            organizationName: `N ${suffix}`,
            storeName: 'N',
            storeCode: `N${suffix}`,
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
      assert.ok(loginRes.body.permissions?.includes('users:manage'));
    } finally {
      await app.close();
    }
  },
);

test(
  'bootstrap: role FK failure rolls back organization (UoW isolation)',
  { skip: !runIntegration },
  async () => {
    const { moduleRef, prisma, uow } = await openBootstrapModule();
    const orgId = crypto.randomUUID();
    try {
      await assert.rejects(() =>
        uow.runInTransaction(async () => {
          const tx = resolvePrismaClient(prisma);
          await tx.organization.create({
            data: { id: orgId, name: `Rollback Org ${orgId.slice(0, 8)}`, status: 'ACTIVE' },
          });
          // Simulate historical bug: insert role on ROOT client (outside tx) → FK fail
          // because org is not committed yet.
          await prisma.role.create({
            data: {
              id: crypto.randomUUID(),
              organizationId: orgId,
              name: 'Director',
              code: 'DIRECTOR_BUG',
              isSystem: true,
            },
          });
        }),
      );

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      assert.equal(org, null, 'organization must roll back when sibling write fails');
      const roles = await prisma.role.count({ where: { organizationId: orgId } });
      assert.equal(roles, 0);
    } finally {
      await prisma.$disconnect();
      await moduleRef.close();
    }
  },
);

test(
  'bootstrap: ensureSystemRoles sees uncommitted organization inside UoW',
  { skip: !runIntegration },
  async () => {
    const { moduleRef, prisma, uow } = await openBootstrapModule();
    const identity = moduleRef.get<IdentityRepository>(IDENTITY_REPOSITORY);
    const orgId = crypto.randomUUID();
    try {
      await uow.runInTransaction(async () => {
        const tx = resolvePrismaClient(prisma);
        await tx.organization.create({
          data: { id: orgId, name: `Tx Org ${orgId.slice(0, 8)}`, status: 'ACTIVE' },
        });
        const roles = await identity.ensureSystemRoles(orgId);
        assert.ok(roles.directorRoleId);
        const role = await tx.role.findUniqueOrThrow({
          where: { organizationId_code: { organizationId: orgId, code: 'DIRECTOR' } },
        });
        assert.equal(role.organizationId, orgId);
      });

      const persisted = await prisma.role.findUnique({
        where: { organizationId_code: { organizationId: orgId, code: 'DIRECTOR' } },
      });
      assert.ok(persisted);
    } finally {
      await prisma.membershipRole.deleteMany({ where: { role: { organizationId: orgId } } });
      await prisma.rolePermission.deleteMany({ where: { role: { organizationId: orgId } } });
      await prisma.role.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
      await prisma.$disconnect();
      await moduleRef.close();
    }
  },
);
