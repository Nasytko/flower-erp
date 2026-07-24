import { Inject, Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
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
} from './ports/repositories';
import {
  DomainError,
  OrganizationStatus,
  StoreStatus,
  assertOrganizationName,
  assertStoreName,
  canArchiveOrganization,
  canArchiveStore,
  canCreateStoreInOrganization,
  defaultWarehouseCode,
  defaultWarehouseName,
  normalizeStoreCode,
  type OrganizationProps,
  type StoreProps,
  type WarehouseProps,
} from '../domain/organization-rules';
import { SeedDefaultMasterDataUseCases } from '../../master-data/application/seed-default-master-data.use-cases';
import { IDENTITY_REPOSITORY, type IdentityRepository } from '../../identity/application/ports/identity.repository';

function mapDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    if (error.code.includes('ALREADY') || error.code.includes('EXISTS') || error.code.includes('INVALID')) {
      if (error.code.includes('EXISTS') || error.code.includes('ALREADY')) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      throw new BadRequestException({ code: error.code, message: error.message });
    }
    throw new BadRequestException({ code: error.code, message: error.message });
  }
  throw error;
}

export type CreateOrganizationInput = {
  name: string;
};

export type CreateStoreInput = {
  organizationId: string;
  name: string;
  code: string;
  address?: string | null;
  timezone?: string;
};

export type ArchiveInput = {
  organizationId: string;
  reason?: string;
};

export type ArchiveStoreInput = {
  organizationId: string;
  storeId: string;
  reason?: string;
};

@Injectable()
export class OrganizationUseCases {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(STORE_REPOSITORY)
    private readonly stores: StoreRepository,
    @Inject(WAREHOUSE_REPOSITORY)
    private readonly warehouses: WarehouseRepository,
    @Inject(UNIT_OF_WORK)
    private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT)
    private readonly audit: AuditPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    private readonly moduleRef: ModuleRef,
  ) {}

  async createOrganization(input: CreateOrganizationInput): Promise<OrganizationProps> {
    try {
      const name = assertOrganizationName(input.name);
      const id = randomUUID();
      const ctx = getRequestContext();

      return await this.uow.runInTransaction(async () => {
        const org = await this.organizations.create({
          id,
          name,
          status: OrganizationStatus.ACTIVE,
        });

        await this.audit.append({
          organizationId: org.id,
          actorId: ctx?.actorId ?? null,
          action: 'organization.created',
          entityType: 'Organization',
          entityId: org.id,
          afterState: { name: org.name, status: org.status },
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });

        await this.moduleRef
          .get(SeedDefaultMasterDataUseCases, { strict: false })
          .seedDefaults(org.id);

        const identity = this.moduleRef.get<IdentityRepository>(IDENTITY_REPOSITORY, {
          strict: false,
        });
        if (identity) {
          await identity.ensureSystemRoles(org.id);
        }

        return org;
      });
    } catch (error) {
      mapDomainError(error);
    }
  }

  async createStoreWithDefaultWarehouse(input: CreateStoreInput): Promise<{
    store: StoreProps;
    warehouse: WarehouseProps;
  }> {
    try {
      const name = assertStoreName(input.name);
      const code = normalizeStoreCode(input.code);
      const ctx = getRequestContext();

      return await this.uow.runInTransaction(async () => {
        const org = await this.organizations.findById(input.organizationId);
        if (!org) {
          throw new NotFoundException({
            code: 'ORGANIZATION_NOT_FOUND',
            message: 'Organization not found',
          });
        }
        canCreateStoreInOrganization(org.status);

        if (await this.stores.existsCode(input.organizationId, code)) {
          throw new ConflictException({
            code: 'STORE_CODE_TAKEN',
            message: 'Store code already exists in this organization',
          });
        }

        const storeId = randomUUID();
        const warehouseId = randomUUID();
        const timezone = input.timezone?.trim() || 'Europe/Moscow';

        const store = await this.stores.create({
          id: storeId,
          organizationId: input.organizationId,
          name,
          code,
          address: input.address?.trim() || null,
          timezone,
          status: StoreStatus.ACTIVE,
        });

        const warehouse = await this.warehouses.create({
          id: warehouseId,
          organizationId: input.organizationId,
          storeId: store.id,
          name: defaultWarehouseName(store.name),
          code: defaultWarehouseCode(),
          isDefault: true,
        });

        await this.audit.append({
          organizationId: input.organizationId,
          storeId: store.id,
          actorId: ctx?.actorId ?? null,
          action: 'store.created',
          entityType: 'Store',
          entityId: store.id,
          afterState: {
            name: store.name,
            code: store.code,
            status: store.status,
            timezone: store.timezone,
          },
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });

        await this.audit.append({
          organizationId: input.organizationId,
          storeId: store.id,
          actorId: ctx?.actorId ?? null,
          action: 'warehouse.created',
          entityType: 'Warehouse',
          entityId: warehouse.id,
          afterState: {
            name: warehouse.name,
            code: warehouse.code,
            isDefault: warehouse.isDefault,
            type: warehouse.type,
          },
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });

        return { store, warehouse };
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      mapDomainError(error);
    }
  }

  async getOrganization(organizationId: string): Promise<OrganizationProps> {
    const org = await this.organizations.findById(organizationId);
    if (!org) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organization not found',
      });
    }
    return org;
  }

  async listOrganizations(page: number, pageSize: number) {
    return this.organizations.list({ page, pageSize });
  }

  async listOrganizationsForUser(userId: string, page: number, pageSize: number) {
    const identity = this.moduleRef.get<IdentityRepository>(IDENTITY_REPOSITORY, { strict: false });
    if (!identity) {
      return this.listOrganizations(page, pageSize);
    }
    const memberships = await identity.listActiveMemberships(userId);
    const ids = memberships.map((m) => m.organizationId);
    return this.organizations.findManyByIds(ids, { page, pageSize });
  }

  async getStore(organizationId: string, storeId: string): Promise<StoreProps> {
    const store = await this.stores.findById(organizationId, storeId);
    if (!store) {
      throw new NotFoundException({
        code: 'STORE_NOT_FOUND',
        message: 'Store not found in this organization',
      });
    }
    return store;
  }

  async listStores(organizationId: string, page: number, pageSize: number) {
    await this.getOrganization(organizationId);
    return this.stores.listByOrganization(organizationId, { page, pageSize });
  }

  async getWarehouse(
    organizationId: string,
    storeId: string,
    warehouseId: string,
  ): Promise<WarehouseProps> {
    await this.getStore(organizationId, storeId);
    const warehouse = await this.warehouses.findById(organizationId, storeId, warehouseId);
    if (!warehouse) {
      throw new NotFoundException({
        code: 'WAREHOUSE_NOT_FOUND',
        message: 'Warehouse not found for this store/organization',
      });
    }
    return warehouse;
  }

  async listWarehouses(organizationId: string, storeId: string): Promise<WarehouseProps[]> {
    await this.getStore(organizationId, storeId);
    return this.warehouses.listByStore(organizationId, storeId);
  }

  /** Idempotent: returns existing warehouses or creates a default one. */
  async ensureDefaultWarehouse(
    organizationId: string,
    storeId: string,
  ): Promise<WarehouseProps[]> {
    const store = await this.getStore(organizationId, storeId);
    const existing = await this.warehouses.listByStore(organizationId, storeId);
    if (existing.length > 0) return existing;

    const ctx = getRequestContext();
    try {
      return await this.uow.runInTransaction(async () => {
        const again = await this.warehouses.listByStore(organizationId, storeId);
        if (again.length > 0) return again;

        const warehouse = await this.warehouses.create({
          id: randomUUID(),
          organizationId,
          storeId: store.id,
          name: defaultWarehouseName(store.name),
          code: defaultWarehouseCode(),
          isDefault: true,
        });

        await this.audit.append({
          organizationId,
          storeId: store.id,
          actorId: ctx?.actorId ?? null,
          action: 'warehouse.created',
          entityType: 'Warehouse',
          entityId: warehouse.id,
          afterState: {
            name: warehouse.name,
            code: warehouse.code,
            isDefault: warehouse.isDefault,
            type: warehouse.type,
          },
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });

        return [warehouse];
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      mapDomainError(error);
    }
  }

  async archiveOrganization(input: ArchiveInput): Promise<OrganizationProps> {
    try {
      const ctx = getRequestContext();
      return await this.uow.runInTransaction(async () => {
        const org = await this.organizations.findById(input.organizationId);
        if (!org) {
          throw new NotFoundException({
            code: 'ORGANIZATION_NOT_FOUND',
            message: 'Organization not found',
          });
        }
        canArchiveOrganization(org.status);
        const updated = await this.organizations.updateStatus(
          org.id,
          OrganizationStatus.ARCHIVED,
        );
        await this.audit.append({
          organizationId: org.id,
          actorId: ctx?.actorId ?? null,
          action: 'organization.archived',
          entityType: 'Organization',
          entityId: org.id,
          beforeState: { status: org.status },
          afterState: { status: updated.status },
          reason: input.reason ?? null,
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      mapDomainError(error);
    }
  }

  async archiveStore(input: ArchiveStoreInput): Promise<StoreProps> {
    try {
      const ctx = getRequestContext();
      return await this.uow.runInTransaction(async () => {
        const store = await this.stores.findById(input.organizationId, input.storeId);
        if (!store) {
          throw new NotFoundException({
            code: 'STORE_NOT_FOUND',
            message: 'Store not found in this organization',
          });
        }
        canArchiveStore(store.status);
        const updated = await this.stores.updateStatus(
          input.organizationId,
          input.storeId,
          StoreStatus.ARCHIVED,
        );
        await this.audit.append({
          organizationId: input.organizationId,
          storeId: store.id,
          actorId: ctx?.actorId ?? null,
          action: 'store.archived',
          entityType: 'Store',
          entityId: store.id,
          beforeState: { status: store.status },
          afterState: { status: updated.status },
          reason: input.reason ?? null,
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      mapDomainError(error);
    }
  }
}
