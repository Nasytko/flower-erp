import type { TransferStatus } from '../../domain/transfer-rules';

export const TRANSFER_REPOSITORY = Symbol('TRANSFER_REPOSITORY');

export type TransferItemView = {
  id: string;
  organizationId: string;
  transferDocumentId: string;
  itemId: string;
  requestedQuantity: string;
  dispatchedQuantity: string | null;
  receivedQuantity: string | null;
  damagedQuantity: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TransferAllocationView = {
  id: string;
  organizationId: string;
  transferDocumentId: string;
  transferItemId: string;
  fromItemId: string;
  toItemId: string | null;
  batchId: string;
  quantityDispatched: string;
  quantityReceived: string | null;
  quantityDamaged: string | null;
  unitCost: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TransferTimelineEventView = {
  id: string;
  organizationId: string;
  transferDocumentId: string;
  type: string;
  message: string | null;
  actorMembershipId: string | null;
  payload: unknown;
  occurredAt: Date;
  createdAt: Date;
};

export type TransferDocumentView = {
  id: string;
  organizationId: string;
  storeId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  number: string;
  status: TransferStatus;
  version: number;
  dispatchedAt: Date | null;
  receivedAt: Date | null;
  cancelledAt: Date | null;
  reversedAt: Date | null;
  comment: string | null;
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: TransferItemView[];
  allocations: TransferAllocationView[];
};

export interface TransferRepository {
  nextNumber(organizationId: string): Promise<string>;
  createDocument(input: {
    id: string;
    organizationId: string;
    storeId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    number: string;
    comment?: string | null;
    createdByMembershipId: string | null;
  }): Promise<TransferDocumentView>;
  getDocument(
    organizationId: string,
    storeId: string,
    transferId: string,
  ): Promise<TransferDocumentView | null>;
  listDocuments(organizationId: string, storeId: string): Promise<TransferDocumentView[]>;
  addItem(input: {
    id: string;
    organizationId: string;
    transferDocumentId: string;
    itemId: string;
    requestedQuantity: string;
  }): Promise<TransferItemView>;
  updateDocument(
    organizationId: string,
    storeId: string,
    transferId: string,
    data: Partial<{
      status: TransferStatus;
      version: number;
      dispatchedAt: Date | null;
      receivedAt: Date | null;
      cancelledAt: Date | null;
      reversedAt: Date | null;
      comment: string | null;
    }>,
    expectedVersion?: number,
  ): Promise<TransferDocumentView | null>;
  listTimeline(organizationId: string, transferId: string): Promise<TransferTimelineEventView[]>;
  appendTimeline(input: {
    id: string;
    organizationId: string;
    transferDocumentId: string;
    type: string;
    message: string | null;
    actorMembershipId: string | null;
    payload: Record<string, unknown> | null;
    occurredAt: Date;
  }): Promise<TransferTimelineEventView>;
}
