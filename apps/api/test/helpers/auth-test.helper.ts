import '../helpers/test-env.js';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { MasterDataModule } from '../../src/modules/master-data/master-data.module.js';
import { IdentityModule } from '../../src/modules/identity/identity.module.js';
import { BootstrapOwnerUseCases } from '../../src/modules/identity/application/bootstrap-owner.use-cases.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';

export type TestAuthContext = {
  accessToken: string;
  organizationId: string;
  storeId: string;
  warehouseId: string;
  login: string;
  password: string;
};

export async function bootstrapDirector(options?: {
  login?: string;
  password?: string;
  organizationName?: string;
}): Promise<TestAuthContext> {
  const suffix = Date.now().toString().slice(-6);
  const login = options?.login ?? `dir${suffix}`;
  const password = options?.password ?? `Password${suffix}!`;
  const organizationName = options?.organizationName ?? `Test Org ${suffix}`;
  const storeCode = `S${suffix}`;

  const moduleRef = await Test.createTestingModule({
    imports: [InfrastructureModule, OrganizationModule, MasterDataModule, IdentityModule],
  }).compile();

  const prisma = moduleRef.get(PrismaService);
  await prisma.$connect();
  const bootstrap = moduleRef.get(BootstrapOwnerUseCases);

  const result = await bootstrap.bootstrapOwner({
    login,
    password,
    displayName: 'Test Director',
    organizationName,
    storeName: 'Test Store',
    storeCode,
  });

  await prisma.$disconnect();
  await moduleRef.close();

  if (!result.storeId || !result.warehouseId) {
    throw new Error('Bootstrap did not create store/warehouse');
  }

  return {
    login,
    password,
    organizationId: result.organizationId,
    storeId: result.storeId,
    warehouseId: result.warehouseId,
    accessToken: '',
  };
}

export async function loginAndGetToken(
  app: INestApplication,
  login: string,
  password: string,
  organizationId: string,
): Promise<string> {
  const server = app.getHttpServer();
  const res = await request(server)
    .post('/api/v1/auth/login')
    .send({ login, password, organizationId })
    .expect(200);
  return res.body.accessToken as string;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
