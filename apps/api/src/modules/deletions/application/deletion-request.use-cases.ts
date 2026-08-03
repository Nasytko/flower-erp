import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DeletionEntityType, DeletionRequestStatus } from '@prisma/client';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { EntityHardDeleteService, type HardDeleteEntityType } from './entity-hard-delete.service';

const REQUEST_PERMISSION_BY_ENTITY: Record<HardDeleteEntityType, readonly string[]> = {
  ITEM: ['master-data:operate', 'master-data:manage'],
  SUPPLIER: ['master-data:operate', 'master-data:manage'],
  CATEGORY: ['master-data:manage'],
  INVENTORY_POLICY: ['master-data:manage'],
  CUSTOMER: ['customers:manage'],
  USER: ['users:manage'],
  COURIER: ['delivery:manage-couriers'],
  PAYMENT_METHOD: ['payments:manage-methods'],
};

function actorMembershipId(): string {
  const id = getRequestContext()?.auth?.membershipId ?? null;
  if (!id) {
    throw new BadRequestException({
      code: 'ACTOR_REQUIRED',
      message: 'Authenticated membership is required',
    });
  }
  return id;
}

function assertCanRequestEntity(entityType: HardDeleteEntityType) {
  const granted = getRequestContext()?.auth?.permissions ?? [];
  const required = REQUEST_PERMISSION_BY_ENTITY[entityType];
  if (!required.some((code) => granted.includes(code))) {
    throw new ForbiddenException({
      code: 'DELETION_REQUEST_FORBIDDEN',
      message: 'You cannot request deletion for this entity type',
    });
  }
}

@Injectable()
export class DeletionRequestUseCases {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hardDelete: EntityHardDeleteService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async createRequest(input: {
    organizationId: string;
    entityType: HardDeleteEntityType;
    entityId: string;
    entityLabel: string;
    storeId?: string | null;
    reason?: string | null;
  }) {
    assertCanRequestEntity(input.entityType);
    const membershipId = actorMembershipId();
    const label = input.entityLabel.trim();
    if (!label) {
      throw new BadRequestException({
        code: 'ENTITY_LABEL_REQUIRED',
        message: 'Entity label is required',
      });
    }

    const pending = await this.prisma.deletionRequest.findFirst({
      where: {
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        status: 'PENDING',
      },
    });
    if (pending) {
      throw new ConflictException({
        code: 'DELETION_ALREADY_PENDING',
        message: 'Deletion for this record is already pending approval',
      });
    }

    const ctx = getRequestContext();
    return this.uow.runInTransaction(async () => {
      const created = await this.prisma.deletionRequest.create({
        data: {
          id: randomUUID(),
          organizationId: input.organizationId,
          entityType: input.entityType as DeletionEntityType,
          entityId: input.entityId,
          entityLabel: label.slice(0, 300),
          storeId: input.storeId ?? null,
          reason: input.reason?.trim() || null,
          requestedByMembershipId: membershipId,
          status: 'PENDING',
        },
      });

      await this.audit.append({
        organizationId: input.organizationId,
        actorId: ctx?.actorId ?? null,
        action: 'deletion.requested',
        entityType: input.entityType,
        entityId: input.entityId,
        beforeState: null,
        afterState: { status: 'PENDING', entityLabel: label },
        reason: input.reason ?? null,
        requestId: ctx?.requestId ?? 'unknown',
        occurredAt: this.clock.now(),
      });

      return this.toView(created);
    });
  }

  async listRequests(
    organizationId: string,
    filter: { status?: DeletionRequestStatus } = {},
  ) {
    const rows = await this.prisma.deletionRequest.findMany({
      where: {
        organizationId,
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toView(row));
  }

  async approveRequest(input: {
    organizationId: string;
    requestId: string;
    comment?: string | null;
  }) {
    const reviewerId = actorMembershipId();
    const ctx = getRequestContext();

    return this.uow.runInTransaction(async () => {
      const request = await this.prisma.deletionRequest.findFirst({
        where: { id: input.requestId, organizationId: input.organizationId },
      });
      if (!request) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Deletion request not found' });
      }
      if (request.status !== 'PENDING') {
        throw new ConflictException({
          code: 'DELETION_NOT_PENDING',
          message: 'Only pending requests can be approved',
        });
      }

      await this.hardDelete.delete(
        input.organizationId,
        request.entityType as HardDeleteEntityType,
        request.entityId,
      );

      const now = this.clock.now();
      const updated = await this.prisma.deletionRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          reviewedByMembershipId: reviewerId,
          reviewComment: input.comment?.trim() || null,
          reviewedAt: now,
        },
      });

      await this.audit.append({
        organizationId: input.organizationId,
        actorId: ctx?.actorId ?? null,
        action: 'deletion.approved',
        entityType: request.entityType,
        entityId: request.entityId,
        beforeState: { status: 'PENDING' },
        afterState: { status: 'APPROVED', entityLabel: request.entityLabel },
        reason: input.comment ?? null,
        requestId: ctx?.requestId ?? 'unknown',
        occurredAt: now,
      });

      return this.toView(updated);
    });
  }

  async rejectRequest(input: {
    organizationId: string;
    requestId: string;
    comment?: string | null;
  }) {
    const reviewerId = actorMembershipId();
    const ctx = getRequestContext();

    return this.uow.runInTransaction(async () => {
      const request = await this.prisma.deletionRequest.findFirst({
        where: { id: input.requestId, organizationId: input.organizationId },
      });
      if (!request) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Deletion request not found' });
      }
      if (request.status !== 'PENDING') {
        throw new ConflictException({
          code: 'DELETION_NOT_PENDING',
          message: 'Only pending requests can be rejected',
        });
      }

      const now = this.clock.now();
      const updated = await this.prisma.deletionRequest.update({
        where: { id: request.id },
        data: {
          status: 'REJECTED',
          reviewedByMembershipId: reviewerId,
          reviewComment: input.comment?.trim() || null,
          reviewedAt: now,
        },
      });

      await this.audit.append({
        organizationId: input.organizationId,
        actorId: ctx?.actorId ?? null,
        action: 'deletion.rejected',
        entityType: request.entityType,
        entityId: request.entityId,
        beforeState: { status: 'PENDING' },
        afterState: { status: 'REJECTED' },
        reason: input.comment ?? null,
        requestId: ctx?.requestId ?? 'unknown',
        occurredAt: now,
      });

      return this.toView(updated);
    });
  }

  private toView(row: {
    id: string;
    organizationId: string;
    entityType: DeletionEntityType;
    entityId: string;
    entityLabel: string;
    storeId: string | null;
    status: DeletionRequestStatus;
    reason: string | null;
    requestedByMembershipId: string;
    reviewedByMembershipId: string | null;
    reviewComment: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      entityType: row.entityType,
      entityId: row.entityId,
      entityLabel: row.entityLabel,
      storeId: row.storeId,
      status: row.status,
      reason: row.reason,
      requestedByMembershipId: row.requestedByMembershipId,
      reviewedByMembershipId: row.reviewedByMembershipId,
      reviewComment: row.reviewComment,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
