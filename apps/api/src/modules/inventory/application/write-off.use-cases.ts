import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import {
  getActivePrismaTx,
  resolvePrismaClient,
} from '../../../infrastructure/persistence/prisma-transaction-context';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ItemUseCases } from '../../master-data/application/item.use-cases';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import {
  InventoryOperationRuleError,
  assertWriteOffLine,
} from '../domain/inventory-operations-rules';
import {
  INVENTORY_WRITE_OFF_PORT,
  type InventoryWriteOffPort,
} from './ports/inventory-write-off.port';

@Injectable()
export class WriteOffUseCases {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationUseCases,
    private readonly items: ItemUseCases,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(INVENTORY_WRITE_OFF_PORT) private readonly inventory: InventoryWriteOffPort,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async create(input: {
    organizationId: string;
    storeId: string;
    warehouseId: string;
    reason: string;
    comment?: string | null;
  }) {
    await this.organizations.getWarehouse(input.organizationId, input.storeId, input.warehouseId);
    const client = resolvePrismaClient(this.prisma);
    return client.writeOffDocument.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        storeId: input.storeId,
        warehouseId: input.warehouseId,
        number: await this.nextNumber(input.organizationId),
        reason: input.reason as never,
        comment: input.comment ?? null,
        createdByMembershipId: actorMembershipId(),
      },
      include: { items: true },
    });
  }

  async addItem(input: {
    organizationId: string;
    storeId: string;
    writeOffId: string;
    itemId: string;
    quantity: string;
  }) {
    try {
      assertWriteOffLine(input.quantity);
    } catch (error) {
      mapRuleError(error);
    }
    await this.items.getItem(input.organizationId, input.itemId);
    return this.uow.runInTransaction(async () => {
      const doc = await this.requireDoc(input.organizationId, input.storeId, input.writeOffId);
      if (doc.status !== 'DRAFT') {
        throw new ConflictException({ code: 'WRITE_OFF_NOT_DRAFT', message: 'Only draft write-offs can be edited' });
      }
      const client = getActivePrismaTx() ?? this.prisma;
      await client.writeOffItem.create({
        data: {
          id: randomUUID(),
          organizationId: input.organizationId,
          writeOffDocumentId: doc.id,
          itemId: input.itemId,
          quantity: new Prisma.Decimal(input.quantity),
        },
      });
      return this.requireDoc(input.organizationId, input.storeId, input.writeOffId);
    });
  }

  async list(organizationId: string, storeId: string) {
    await this.organizations.getStore(organizationId, storeId);
    const client = resolvePrismaClient(this.prisma);
    return client.writeOffDocument.findMany({
      where: { organizationId, storeId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(organizationId: string, storeId: string, writeOffId: string) {
    return this.requireDoc(organizationId, storeId, writeOffId);
  }

  async post(input: {
    organizationId: string;
    storeId: string;
    writeOffId: string;
    idempotencyKey: string;
  }) {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    return this.uow.runInTransaction(async () => {
      const doc = await this.requireDoc(input.organizationId, input.storeId, input.writeOffId);
      if (doc.status === 'POSTED') return doc;
      if (doc.status !== 'DRAFT') {
        throw new ConflictException({ code: 'WRITE_OFF_NOT_DRAFT', message: 'Only draft write-offs can be posted' });
      }
      if (doc.items.length === 0) {
        throw new BadRequestException({ code: 'WRITE_OFF_EMPTY', message: 'Write-off must have at least one item' });
      }

      await this.inventory.postWriteOff({
        organizationId: doc.organizationId,
        storeId: doc.storeId,
        warehouseId: doc.warehouseId,
        writeOffId: doc.id,
        occurredAt: this.clock.now(),
        idempotencyKey: input.idempotencyKey,
        lines: doc.items.map((item) => ({
          writeOffItemId: item.id,
          itemId: item.itemId,
          quantity: item.quantity.toString(),
        })),
      });

      const ctx = getRequestContext();
      await this.audit.append({
        organizationId: doc.organizationId,
        storeId: doc.storeId,
        actorId: ctx?.actorId ?? null,
        action: 'write_off.posted',
        entityType: 'WriteOffDocument',
        entityId: doc.id,
        afterState: {},
        requestId: ctx?.requestId ?? 'unknown',
        occurredAt: this.clock.now(),
      });

      const client = getActivePrismaTx() ?? this.prisma;
      await client.writeOffDocument.update({
        where: { id: doc.id },
        data: { status: 'POSTED', postedAt: this.clock.now() },
      });
      return this.requireDoc(input.organizationId, input.storeId, input.writeOffId);
    });
  }

  async reverse(input: {
    organizationId: string;
    storeId: string;
    writeOffId: string;
    idempotencyKey: string;
  }) {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    return this.uow.runInTransaction(async () => {
      const doc = await this.requireDoc(input.organizationId, input.storeId, input.writeOffId);
      if (doc.status === 'REVERSED') return doc;
      if (doc.status !== 'POSTED') {
        throw new ConflictException({ code: 'WRITE_OFF_NOT_POSTED', message: 'Only posted write-offs can be reversed' });
      }
      await this.inventory.reverseWriteOff({
        organizationId: doc.organizationId,
        storeId: doc.storeId,
        warehouseId: doc.warehouseId,
        writeOffId: doc.id,
        occurredAt: this.clock.now(),
        idempotencyKey: input.idempotencyKey,
      });
      const client = getActivePrismaTx() ?? this.prisma;
      await client.writeOffDocument.update({
        where: { id: doc.id },
        data: { status: 'REVERSED', reversedAt: this.clock.now(), version: { increment: 1 } },
      });
      return this.requireDoc(input.organizationId, input.storeId, input.writeOffId);
    });
  }

  private async requireDoc(organizationId: string, storeId: string, writeOffId: string) {
    const client = getActivePrismaTx() ?? this.prisma;
    const doc = await client.writeOffDocument.findFirst({
      where: { id: writeOffId, organizationId, storeId },
      include: { items: true },
    });
    if (!doc) {
      throw new NotFoundException({ code: 'WRITE_OFF_NOT_FOUND', message: 'Write-off not found' });
    }
    return doc;
  }

  private async nextNumber(organizationId: string): Promise<string> {
    const client = resolvePrismaClient(this.prisma);
    const count = await client.writeOffDocument.count({ where: { organizationId } });
    return `WOF-${String(count + 1).padStart(5, '0')}`;
  }
}

function actorMembershipId(): string | null {
  return getRequestContext()?.auth?.membershipId ?? null;
}

function mapRuleError(error: unknown): never {
  if (error instanceof InventoryOperationRuleError) {
    throw new BadRequestException({ code: error.code, message: error.message });
  }
  throw error;
}
