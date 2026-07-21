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
  INVENTORY_POLICY_REPOSITORY,
  type InventoryPolicyRepository,
} from './ports/repositories';
import {
  ItemType,
  InventoryPolicyPresetCode,
  MasterDataStatus,
  TrackingMethod,
  assertCanArchivePolicy,
  assertEntityName,
  assertInventoryPolicyShape,
  type InventoryPolicyProps,
} from '../domain/master-data-rules';
import { mapDomainError } from './map-domain-error';

@Injectable()
export class PolicyUseCases {
  constructor(
    @Inject(INVENTORY_POLICY_REPOSITORY) private readonly policies: InventoryPolicyRepository,
    private readonly organizations: OrganizationUseCases,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async createInventoryPolicy(input: {
    organizationId: string;
    name: string;
    itemType: ItemType;
    trackingMethod: TrackingMethod;
    reservationAllowed?: boolean;
    expirationTracking: boolean;
    defaultShelfLifeDays?: number | null;
    presetCode?: InventoryPolicyPresetCode | null;
  }): Promise<InventoryPolicyProps> {
    try {
      await this.organizations.getOrganization(input.organizationId);
      const name = assertEntityName(input.name, 'POLICY');
      const defaultShelfLifeDays = input.defaultShelfLifeDays ?? null;
      assertInventoryPolicyShape({
        itemType: input.itemType,
        trackingMethod: input.trackingMethod,
        expirationTracking: input.expirationTracking,
        defaultShelfLifeDays,
      });
      const ctx = getRequestContext();

      return await this.uow.runInTransaction(async () => {
        const policy = await this.policies.create({
          id: randomUUID(),
          organizationId: input.organizationId,
          name,
          itemType: input.itemType,
          trackingMethod: input.trackingMethod,
          reservationAllowed: input.reservationAllowed ?? false,
          expirationTracking: input.expirationTracking,
          defaultShelfLifeDays,
          presetCode: input.presetCode ?? null,
          status: MasterDataStatus.ACTIVE,
        });

        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'inventory_policy.created',
          entityType: 'InventoryPolicy',
          entityId: policy.id,
          afterState: {
            name: policy.name,
            itemType: policy.itemType,
            trackingMethod: policy.trackingMethod,
            expirationTracking: policy.expirationTracking,
            status: policy.status,
          },
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });

        return policy;
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

  async listPolicies(organizationId: string, page: number, pageSize: number) {
    await this.organizations.getOrganization(organizationId);
    return this.policies.list(organizationId, { page, pageSize });
  }

  async getPolicy(organizationId: string, policyId: string): Promise<InventoryPolicyProps> {
    const policy = await this.policies.findById(organizationId, policyId);
    if (!policy) {
      throw new NotFoundException({
        code: 'POLICY_NOT_FOUND',
        message: 'Inventory policy not found in this organization',
      });
    }
    return policy;
  }

  async archiveInventoryPolicy(input: {
    organizationId: string;
    policyId: string;
    reason?: string;
  }): Promise<InventoryPolicyProps> {
    try {
      const ctx = getRequestContext();
      return await this.uow.runInTransaction(async () => {
        const policy = await this.policies.findById(input.organizationId, input.policyId);
        if (!policy) {
          throw new NotFoundException({
            code: 'POLICY_NOT_FOUND',
            message: 'Inventory policy not found in this organization',
          });
        }
        const itemCount = await this.policies.countItems(input.organizationId, input.policyId);
        assertCanArchivePolicy({ status: policy.status, itemCount });

        const updated = await this.policies.updateStatus(
          input.organizationId,
          input.policyId,
          MasterDataStatus.ARCHIVED,
        );
        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'inventory_policy.archived',
          entityType: 'InventoryPolicy',
          entityId: policy.id,
          beforeState: { status: policy.status },
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
