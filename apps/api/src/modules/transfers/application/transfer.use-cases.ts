import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { ItemUseCases } from '../../master-data/application/item.use-cases';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import {
  INVENTORY_TRANSFER_PORT,
  type InventoryTransferPort,
} from '../../inventory/application/ports/inventory-transfer.port';
import {
  assertTransferDispatch,
  assertTransferReceipt,
} from '../../inventory/domain/inventory-operations-rules';
import {
  TransferRuleError,
  TransferStatus,
  assertCanCancel,
  assertCanDispatch,
  assertCanEdit,
  assertCanReceive,
  assertCanReverse,
} from '../domain/transfer-rules';
import {
  TRANSFER_REPOSITORY,
  type TransferRepository,
} from './ports/transfer.repository';

@Injectable()
export class TransferUseCases {
  constructor(
    @Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository,
    @Inject(INVENTORY_TRANSFER_PORT) private readonly inventory: InventoryTransferPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    private readonly organizations: OrganizationUseCases,
    private readonly items: ItemUseCases,
  ) {}

  async create(input: {
    organizationId: string;
    storeId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    comment?: string | null;
  }) {
    await this.organizations.getWarehouse(input.organizationId, input.storeId, input.fromWarehouseId);
    await this.organizations.getWarehouse(input.organizationId, input.storeId, input.toWarehouseId);
    if (input.fromWarehouseId === input.toWarehouseId) {
      throw new BadRequestException({
        code: 'TRANSFER_WAREHOUSE_SAME',
        message: 'Source and destination warehouses must differ',
      });
    }
    return this.transfers.createDocument({
      id: randomUUID(),
      organizationId: input.organizationId,
      storeId: input.storeId,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      number: await this.transfers.nextNumber(input.organizationId),
      comment: input.comment ?? null,
      createdByMembershipId: actorMembershipId(),
    });
  }

  async addItem(input: {
    organizationId: string;
    storeId: string;
    transferId: string;
    itemId: string;
    requestedQuantity: string;
  }) {
    await this.items.getItem(input.organizationId, input.itemId);
    return this.uow.runInTransaction(async () => {
      const doc = await this.requireTransfer(input.organizationId, input.storeId, input.transferId);
      try {
        assertCanEdit(doc.status);
        assertTransferDispatch(input.requestedQuantity, input.requestedQuantity);
      } catch (error) {
        mapError(error);
      }
      await this.transfers.addItem({
        id: randomUUID(),
        organizationId: input.organizationId,
        transferDocumentId: doc.id,
        itemId: input.itemId,
        requestedQuantity: input.requestedQuantity,
      });
      return this.requireTransfer(input.organizationId, input.storeId, input.transferId);
    });
  }

  async list(organizationId: string, storeId: string) {
    await this.organizations.getStore(organizationId, storeId);
    return this.transfers.listDocuments(organizationId, storeId);
  }

  async get(organizationId: string, storeId: string, transferId: string) {
    return this.requireTransfer(organizationId, storeId, transferId);
  }

  async dispatch(input: {
    organizationId: string;
    storeId: string;
    transferId: string;
    expectedVersion: number;
    idempotencyKey: string;
    items: Array<{ transferItemId: string; dispatchQuantity: string }>;
  }) {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    return this.uow.runInTransaction(async () => {
      const doc = await this.requireTransfer(input.organizationId, input.storeId, input.transferId);
      try {
        assertCanDispatch(doc.status);
      } catch (error) {
        mapError(error);
      }
      if (doc.version !== input.expectedVersion) {
        throw versionConflict(doc.version);
      }

      const byId = new Map(doc.items.map((item) => [item.id, item]));
      for (const line of input.items) {
        const item = byId.get(line.transferItemId);
        if (!item) {
          throw new NotFoundException({ code: 'TRANSFER_ITEM_NOT_FOUND', message: 'Transfer item not found' });
        }
        assertTransferDispatch(item.requestedQuantity, line.dispatchQuantity);
      }

      await this.inventory.dispatchTransfer({
        organizationId: doc.organizationId,
        storeId: doc.storeId,
        fromWarehouseId: doc.fromWarehouseId,
        transferId: doc.id,
        occurredAt: this.clock.now(),
        idempotencyKey: input.idempotencyKey,
        lines: input.items.map((line) => {
          const item = byId.get(line.transferItemId)!;
          return {
            transferItemId: item.id,
            itemId: item.itemId,
            requestedQuantity: item.requestedQuantity,
            dispatchQuantity: line.dispatchQuantity,
          };
        }),
      });

      const updated = await this.transfers.updateDocument(
        doc.organizationId,
        doc.storeId,
        doc.id,
        { status: TransferStatus.DISPATCHED, dispatchedAt: this.clock.now() },
        input.expectedVersion,
      );
      if (!updated) throw versionConflict(doc.version);
      await this.appendTimeline(updated.id, updated.organizationId, 'TRANSFER_DISPATCHED', 'Transfer dispatched');
      return this.requireTransfer(input.organizationId, input.storeId, input.transferId);
    });
  }

  async receive(input: {
    organizationId: string;
    storeId: string;
    transferId: string;
    expectedVersion: number;
    idempotencyKey: string;
    allocations: Array<{
      transferAllocationId: string;
      transferItemId: string;
      itemId: string;
      receivedQuantity: string;
      damagedQuantity: string;
    }>;
  }) {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    return this.uow.runInTransaction(async () => {
      const doc = await this.requireTransfer(input.organizationId, input.storeId, input.transferId);
      try {
        assertCanReceive(doc.status);
      } catch (error) {
        mapError(error);
      }
      if (doc.version !== input.expectedVersion) {
        throw versionConflict(doc.version);
      }
      const allocationMap = new Map(doc.allocations.map((row) => [row.id, row]));
      for (const line of input.allocations) {
        const allocation = allocationMap.get(line.transferAllocationId);
        if (!allocation) {
          throw new NotFoundException({
            code: 'TRANSFER_ALLOCATION_NOT_FOUND',
            message: 'Transfer allocation not found',
          });
        }
        assertTransferReceipt(
          allocation.quantityDispatched,
          line.receivedQuantity,
          line.damagedQuantity,
        );
      }
      await this.inventory.receiveTransfer({
        organizationId: doc.organizationId,
        storeId: doc.storeId,
        toWarehouseId: doc.toWarehouseId,
        transferId: doc.id,
        occurredAt: this.clock.now(),
        idempotencyKey: input.idempotencyKey,
        lines: input.allocations,
      });
      const updated = await this.transfers.updateDocument(
        doc.organizationId,
        doc.storeId,
        doc.id,
        { status: TransferStatus.RECEIVED, receivedAt: this.clock.now() },
        input.expectedVersion,
      );
      if (!updated) throw versionConflict(doc.version);
      await this.appendTimeline(updated.id, updated.organizationId, 'TRANSFER_RECEIVED', 'Transfer received');
      return this.requireTransfer(input.organizationId, input.storeId, input.transferId);
    });
  }

  async cancel(input: {
    organizationId: string;
    storeId: string;
    transferId: string;
    expectedVersion: number;
    idempotencyKey?: string;
  }) {
    return this.uow.runInTransaction(async () => {
      const doc = await this.requireTransfer(input.organizationId, input.storeId, input.transferId);
      try {
        assertCanCancel(doc.status);
      } catch (error) {
        mapError(error);
      }
      if (doc.version !== input.expectedVersion) {
        throw versionConflict(doc.version);
      }
      if (doc.status === TransferStatus.DISPATCHED) {
        if (!input.idempotencyKey?.trim()) {
          throw new BadRequestException({
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'Idempotency-Key header is required',
          });
        }
        await this.inventory.reverseTransfer({
          organizationId: doc.organizationId,
          storeId: doc.storeId,
          fromWarehouseId: doc.fromWarehouseId,
          toWarehouseId: doc.toWarehouseId,
          transferId: doc.id,
          occurredAt: this.clock.now(),
          idempotencyKey: input.idempotencyKey,
        });
      }
      const updated = await this.transfers.updateDocument(
        doc.organizationId,
        doc.storeId,
        doc.id,
        { status: TransferStatus.CANCELLED, cancelledAt: this.clock.now() },
        input.expectedVersion,
      );
      if (!updated) throw versionConflict(doc.version);
      await this.appendTimeline(updated.id, updated.organizationId, 'TRANSFER_CANCELLED', 'Transfer cancelled');
      return this.requireTransfer(input.organizationId, input.storeId, input.transferId);
    });
  }

  async reverse(input: {
    organizationId: string;
    storeId: string;
    transferId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }) {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    return this.uow.runInTransaction(async () => {
      const doc = await this.requireTransfer(input.organizationId, input.storeId, input.transferId);
      try {
        assertCanReverse(doc.status);
      } catch (error) {
        mapError(error);
      }
      if (doc.version !== input.expectedVersion) {
        throw versionConflict(doc.version);
      }
      await this.inventory.reverseTransfer({
        organizationId: doc.organizationId,
        storeId: doc.storeId,
        fromWarehouseId: doc.fromWarehouseId,
        toWarehouseId: doc.toWarehouseId,
        transferId: doc.id,
        occurredAt: this.clock.now(),
        idempotencyKey: input.idempotencyKey,
      });
      const updated = await this.transfers.updateDocument(
        doc.organizationId,
        doc.storeId,
        doc.id,
        { status: TransferStatus.REVERSED, reversedAt: this.clock.now() },
        input.expectedVersion,
      );
      if (!updated) throw versionConflict(doc.version);
      await this.appendTimeline(updated.id, updated.organizationId, 'TRANSFER_REVERSED', 'Transfer reversed');
      return this.requireTransfer(input.organizationId, input.storeId, input.transferId);
    });
  }

  async timeline(organizationId: string, storeId: string, transferId: string) {
    await this.requireTransfer(organizationId, storeId, transferId);
    return this.transfers.listTimeline(organizationId, transferId);
  }

  private async requireTransfer(organizationId: string, storeId: string, transferId: string) {
    const doc = await this.transfers.getDocument(organizationId, storeId, transferId);
    if (!doc) {
      throw new NotFoundException({ code: 'TRANSFER_NOT_FOUND', message: 'Transfer not found' });
    }
    return doc;
  }

  private async appendTimeline(
    transferId: string,
    organizationId: string,
    type: string,
    message: string,
  ) {
    await this.transfers.appendTimeline({
      id: randomUUID(),
      organizationId,
      transferDocumentId: transferId,
      type,
      message,
      actorMembershipId: actorMembershipId(),
      payload: null,
      occurredAt: this.clock.now(),
    });
  }
}

function actorMembershipId(): string | null {
  return getRequestContext()?.auth?.membershipId ?? null;
}

function versionConflict(version: number): ConflictException {
  return new ConflictException({
    code: 'VERSION_CONFLICT',
    message: 'Transfer version conflict',
    version,
  });
}

function mapError(error: unknown): never {
  if (error instanceof TransferRuleError) {
    throw new ConflictException({ code: error.code, message: error.message });
  }
  throw error;
}
