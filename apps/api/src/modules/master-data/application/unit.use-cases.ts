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
import {
  UNIT_OF_MEASURE_REPOSITORY,
  type UnitOfMeasureRepository,
} from './ports/repositories';
import {
  MasterDataStatus,
  assertCanArchiveUnit,
  assertEntityName,
  assertQuantityScale,
  assertUnitSymbol,
  type UnitOfMeasureProps,
} from '../domain/master-data-rules';
import { mapDomainError } from './map-domain-error';

@Injectable()
export class UnitUseCases {
  constructor(
    @Inject(UNIT_OF_MEASURE_REPOSITORY) private readonly units: UnitOfMeasureRepository,
    private readonly organizations: OrganizationUseCases,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async createUnit(input: {
    organizationId: string;
    name: string;
    symbol: string;
    quantityScale?: number;
  }): Promise<UnitOfMeasureProps> {
    try {
      await this.organizations.getOrganization(input.organizationId);
      const name = assertEntityName(input.name, 'UNIT');
      const symbol = assertUnitSymbol(input.symbol);
      const quantityScale = assertQuantityScale(input.quantityScale ?? 0);
      const ctx = getRequestContext();

      return await this.uow.runInTransaction(async () => {
        if (await this.units.existsSymbol(input.organizationId, symbol)) {
          throw new ConflictException({
            code: 'UNIT_SYMBOL_TAKEN',
            message: 'Unit symbol already exists in this organization',
          });
        }

        const unit = await this.units.create({
          id: randomUUID(),
          organizationId: input.organizationId,
          name,
          symbol,
          quantityScale,
          status: MasterDataStatus.ACTIVE,
        });

        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'unit_of_measure.created',
          entityType: 'UnitOfMeasure',
          entityId: unit.id,
          afterState: { name: unit.name, symbol: unit.symbol, quantityScale: unit.quantityScale, status: unit.status },
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });

        return unit;
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

  async listUnits(organizationId: string, page: number, pageSize: number) {
    await this.organizations.getOrganization(organizationId);
    return this.units.list(organizationId, { page, pageSize });
  }

  async getUnit(organizationId: string, unitId: string): Promise<UnitOfMeasureProps> {
    const unit = await this.units.findById(organizationId, unitId);
    if (!unit) {
      throw new NotFoundException({
        code: 'UNIT_NOT_FOUND',
        message: 'Unit of measure not found in this organization',
      });
    }
    return unit;
  }

  async archiveUnit(input: {
    organizationId: string;
    unitId: string;
    reason?: string;
  }): Promise<UnitOfMeasureProps> {
    try {
      const ctx = getRequestContext();
      return await this.uow.runInTransaction(async () => {
        const unit = await this.units.findById(input.organizationId, input.unitId);
        if (!unit) {
          throw new NotFoundException({
            code: 'UNIT_NOT_FOUND',
            message: 'Unit of measure not found in this organization',
          });
        }
        const itemCount = await this.units.countItems(input.organizationId, input.unitId);
        assertCanArchiveUnit({ status: unit.status, itemCount });

        const updated = await this.units.updateStatus(
          input.organizationId,
          input.unitId,
          MasterDataStatus.ARCHIVED,
        );
        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'unit_of_measure.archived',
          entityType: 'UnitOfMeasure',
          entityId: unit.id,
          beforeState: { status: unit.status },
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
