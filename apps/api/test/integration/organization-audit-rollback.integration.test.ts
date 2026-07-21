import assert from 'node:assert/strict';
import test from 'node:test';
import { Test } from '@nestjs/testing';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { OrganizationUseCases } from '../../src/modules/organization/application/organization.use-cases.js';
import { AUDIT_PORT, type AuditPort } from '../../src/infrastructure/audit/audit.port.js';
import { requestContextStorage } from '../../src/infrastructure/context/request-context.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runIntegration = Boolean(DATABASE_URL) && process.env.SKIP_INTEGRATION !== '1';

test(
  'store+warehouse roll back when audit throws mid-transaction',
  { skip: !runIntegration },
  async () => {
    let calls = 0;
    const failingAudit: AuditPort = {
      async append() {
        calls += 1;
        if (calls >= 1) {
          throw new Error('audit failed');
        }
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [InfrastructureModule, OrganizationModule],
    })
      .overrideProvider(AUDIT_PORT)
      .useValue(failingAudit)
      .compile();

    const useCases = moduleRef.get(OrganizationUseCases);
    const prisma = moduleRef.get(PrismaService);
    await prisma.$connect();

    await requestContextStorage.run(
      { requestId: 'audit-fail', actorId: null, organizationId: null },
      async () => {
        const org = await prisma.organization.create({
          data: { id: crypto.randomUUID(), name: `FailAudit ${Date.now()}`, status: 'ACTIVE' },
        });

        const beforeStores = await prisma.store.count({ where: { organizationId: org.id } });
        await assert.rejects(() =>
          useCases.createStoreWithDefaultWarehouse({
            organizationId: org.id,
            name: 'Should Rollback',
            code: `R${Date.now().toString().slice(-5)}`,
          }),
        );
        const afterStores = await prisma.store.count({ where: { organizationId: org.id } });
        const afterWh = await prisma.warehouse.count({ where: { organizationId: org.id } });
        assert.equal(afterStores, beforeStores);
        assert.equal(afterWh, 0);
      },
    );

    await prisma.$disconnect();
    await moduleRef.close();
  },
);
