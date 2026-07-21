import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import { SUPPLIER_REPOSITORY, type SupplierRepository } from './ports/repositories';
import {
  MasterDataStatus,
  assertEntityName,
  assertOptionalText,
  canArchiveMasterRecord,
  normalizeMasterCode,
  type SupplierProps,
} from '../domain/master-data-rules';
import { mapDomainError } from './map-domain-error';

@Injectable()
export class SupplierUseCases {
  constructor(
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepository,
    private readonly organizations: OrganizationUseCases,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async createSupplier(input: {
    organizationId: string;
    name: string;
    code: string;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
    contactPerson?: string | null;
    comment?: string | null;
  }): Promise<SupplierProps> {
    try {
      await this.organizations.getOrganization(input.organizationId);
      const name = assertEntityName(input.name, 'SUPPLIER');
      const code = normalizeMasterCode(input.code, 'SUPPLIER');
      const ctx = getRequestContext();

      return await this.uow.runInTransaction(async () => {
        if (await this.suppliers.existsCode(input.organizationId, code)) {
          throw new ConflictException({
            code: 'SUPPLIER_CODE_TAKEN',
            message: 'Supplier code already exists in this organization',
          });
        }

        const supplier = await this.suppliers.create({
          id: randomUUID(),
          organizationId: input.organizationId,
          name,
          code,
          country: assertOptionalText(input.country, 100),
          phone: assertOptionalText(input.phone, 64),
          email: assertOptionalText(input.email, 200),
          contactPerson: assertOptionalText(input.contactPerson, 200),
          comment: assertOptionalText(input.comment, 2000),
          status: MasterDataStatus.ACTIVE,
        });

        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'supplier.created',
          entityType: 'Supplier',
          entityId: supplier.id,
          afterState: {
            name: supplier.name,
            code: supplier.code,
            status: supplier.status,
          },
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });

        return supplier;
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

  async getSupplier(organizationId: string, supplierId: string): Promise<SupplierProps> {
    const supplier = await this.suppliers.findById(organizationId, supplierId);
    if (!supplier) {
      throw new NotFoundException({
        code: 'SUPPLIER_NOT_FOUND',
        message: 'Supplier not found in this organization',
      });
    }
    return supplier;
  }

  async listSuppliers(
    organizationId: string,
    page: number,
    pageSize: number,
    filter: { status?: MasterDataStatus; name?: string },
  ) {
    await this.organizations.getOrganization(organizationId);
    return this.suppliers.list(organizationId, { page, pageSize }, filter);
  }

  async archiveSupplier(input: {
    organizationId: string;
    supplierId: string;
    reason?: string;
  }): Promise<SupplierProps> {
    try {
      const ctx = getRequestContext();
      return await this.uow.runInTransaction(async () => {
        const supplier = await this.suppliers.findById(input.organizationId, input.supplierId);
        if (!supplier) {
          throw new NotFoundException({
            code: 'SUPPLIER_NOT_FOUND',
            message: 'Supplier not found in this organization',
          });
        }
        canArchiveMasterRecord(supplier.status, 'SUPPLIER');
        const updated = await this.suppliers.updateStatus(
          input.organizationId,
          input.supplierId,
          MasterDataStatus.ARCHIVED,
        );
        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'supplier.archived',
          entityType: 'Supplier',
          entityId: supplier.id,
          beforeState: { status: supplier.status },
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
