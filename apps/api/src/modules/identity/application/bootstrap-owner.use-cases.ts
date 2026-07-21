import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import {
  ORGANIZATION_REPOSITORY,
  STORE_REPOSITORY,
  WAREHOUSE_REPOSITORY,
  type OrganizationRepository,
  type StoreRepository,
  type WarehouseRepository,
} from '../../organization/application/ports/repositories';
import {
  OrganizationStatus,
  StoreStatus,
  assertOrganizationName,
  assertStoreName,
  canCreateStoreInOrganization,
  defaultWarehouseCode,
  defaultWarehouseName,
  normalizeStoreCode,
} from '../../organization/domain/organization-rules';
import { SeedDefaultMasterDataUseCases } from '../../master-data/application/seed-default-master-data.use-cases';
import {
  IDENTITY_REPOSITORY,
  type IdentityRepository,
} from '../application/ports/identity.repository';
import {
  assertLogin,
  assertPasswordPolicy,
  normalizeLogin,
} from '../domain/identity-rules';
import { Argon2PasswordService } from '../../../infrastructure/security/password.service';
import { API_ENV } from '../../../infrastructure/infrastructure.module';
import type { ApiEnv } from '@flower/config';

export type BootstrapOwnerInput = {
  organizationName?: string;
  organizationId?: string;
  storeName?: string;
  storeCode?: string;
  login: string;
  password: string;
  displayName: string;
  email?: string | null;
};

@Injectable()
export class BootstrapOwnerUseCases {
  constructor(
    @Inject(IDENTITY_REPOSITORY) private readonly identity: IdentityRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    @Inject(STORE_REPOSITORY) private readonly stores: StoreRepository,
    @Inject(WAREHOUSE_REPOSITORY) private readonly warehouses: WarehouseRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly passwords: Argon2PasswordService,
    private readonly seedMasterData: SeedDefaultMasterDataUseCases,
  ) {}

  async bootstrapOwner(input: BootstrapOwnerInput) {
    if (!this.env.ALLOW_OWNER_BOOTSTRAP) {
      throw new ForbiddenException({ code: 'BOOTSTRAP_DISABLED', message: 'Owner bootstrap is disabled' });
    }

    assertLogin(input.login);
    assertPasswordPolicy(input.password);
    const login = normalizeLogin(input.login);

    const existing = await this.identity.findUserByLogin(login);
    if (existing) {
      throw new ConflictException({ code: 'USER_EXISTS', message: 'User login already exists' });
    }

    if (input.organizationId) {
      const hasOwner = await this.identity.organizationHasOwner(input.organizationId);
      if (hasOwner) {
        throw new ConflictException({ code: 'OWNER_EXISTS', message: 'Organization already has an owner' });
      }
    } else {
      const userCount = await this.identity.countUsers();
      if (userCount > 0) {
        throw new ConflictException({ code: 'BOOTSTRAP_ALREADY_DONE', message: 'System already bootstrapped' });
      }
    }

    const passwordHash = await this.passwords.hash(input.password);

    return this.uow.runInTransaction(async () => {
      let organizationId = input.organizationId;
      if (!organizationId) {
        assertOrganizationName(input.organizationName ?? '');
        const org = await this.organizations.create({
          id: randomUUID(),
          name: input.organizationName!.trim(),
          status: OrganizationStatus.ACTIVE,
        });
        organizationId = org.id;
        await this.audit.append({
          organizationId,
          storeId: null,
          action: 'ORGANIZATION_CREATED',
          entityType: 'Organization',
          entityId: organizationId,
          beforeState: null,
          afterState: org,
          reason: 'bootstrap',
          requestId: getRequestContext()?.requestId ?? 'bootstrap',
          ipAddress: null,
          userAgent: null,
        });
      }

      const roles = await this.identity.ensureSystemRoles(organizationId);
      await this.seedMasterData.seedDefaults(organizationId);

      let storeId: string | undefined;
      let warehouseId: string | undefined;
      if (input.storeName && input.storeCode) {
        const org = await this.organizations.findById(organizationId);
        if (!org) throw new NotFoundException('Organization not found');
        canCreateStoreInOrganization(org.status);
        assertStoreName(input.storeName);
        const code = normalizeStoreCode(input.storeCode);
        storeId = randomUUID();
        warehouseId = randomUUID();
        await this.stores.create({
          id: storeId,
          organizationId,
          name: input.storeName.trim(),
          code,
          address: null,
          timezone: 'Europe/Moscow',
          status: StoreStatus.ACTIVE,
        });
        await this.warehouses.create({
          id: warehouseId,
          organizationId,
          storeId,
          name: defaultWarehouseName(input.storeName.trim()),
          code: defaultWarehouseCode(),
          isDefault: true,
        });
      }

      const user = await this.identity.createUser({
        login,
        email: input.email ?? null,
        passwordHash,
        displayName: input.displayName.trim(),
        mustChangePassword: false,
      });

      const membership = await this.identity.createMembership({
        organizationId,
        userId: user.id,
        storeAccessMode: 'ALL_STORES',
      });
      await this.identity.assignRole(membership.id, roles.directorRoleId);

      await this.audit.append({
        organizationId,
        storeId: storeId ?? null,
        action: 'BOOTSTRAP_OWNER',
        entityType: 'User',
        entityId: user.id,
        beforeState: null,
        afterState: { login: user.login, membershipId: membership.id },
        reason: 'bootstrap',
        requestId: getRequestContext()?.requestId ?? 'bootstrap',
        ipAddress: null,
        userAgent: null,
      });

      return {
        organizationId,
        storeId,
        warehouseId,
        userId: user.id,
        login: user.login,
      };
    });
  }
}
