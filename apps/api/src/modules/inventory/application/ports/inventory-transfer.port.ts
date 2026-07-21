export const INVENTORY_TRANSFER_PORT = Symbol('INVENTORY_TRANSFER_PORT');

export type TransferDispatchLine = {
  transferItemId: string;
  itemId: string;
  requestedQuantity: string;
  dispatchQuantity: string;
};

export type TransferReceiveLine = {
  transferAllocationId: string;
  transferItemId: string;
  itemId: string;
  receivedQuantity: string;
  damagedQuantity: string;
};

export type DispatchTransferCommand = {
  organizationId: string;
  storeId: string;
  fromWarehouseId: string;
  transferId: string;
  occurredAt: Date;
  idempotencyKey: string;
  lines: TransferDispatchLine[];
};

export type ReceiveTransferCommand = {
  organizationId: string;
  storeId: string;
  toWarehouseId: string;
  transferId: string;
  occurredAt: Date;
  idempotencyKey: string;
  lines: TransferReceiveLine[];
};

export type ReverseTransferCommand = {
  organizationId: string;
  storeId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  transferId: string;
  occurredAt: Date;
  idempotencyKey: string;
};

export type DispatchTransferResult = {
  idempotentReplay: boolean;
  allocations: Array<{
    transferAllocationId: string;
    transferItemId: string;
    itemId: string;
    batchId: string;
    quantityDispatched: string;
    unitCost: string;
  }>;
};

export interface InventoryTransferPort {
  dispatchTransfer(command: DispatchTransferCommand): Promise<DispatchTransferResult>;
  receiveTransfer(command: ReceiveTransferCommand): Promise<{ idempotentReplay: boolean }>;
  reverseTransfer(command: ReverseTransferCommand): Promise<{ idempotentReplay: boolean }>;
}
