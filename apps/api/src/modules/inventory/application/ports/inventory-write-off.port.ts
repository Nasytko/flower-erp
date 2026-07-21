export const INVENTORY_WRITE_OFF_PORT = Symbol('INVENTORY_WRITE_OFF_PORT');

export type WriteOffPostingLine = {
  writeOffItemId: string;
  itemId: string;
  quantity: string;
};

export type PostWriteOffCommand = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  writeOffId: string;
  lines: WriteOffPostingLine[];
  occurredAt: Date;
  idempotencyKey: string;
};

export type ReverseWriteOffCommand = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  writeOffId: string;
  occurredAt: Date;
  idempotencyKey: string;
};

export type WriteOffPostingResult = {
  idempotentReplay: boolean;
  totalCostAmount: string;
};

export interface InventoryWriteOffPort {
  postWriteOff(command: PostWriteOffCommand): Promise<WriteOffPostingResult>;
  reverseWriteOff(command: ReverseWriteOffCommand): Promise<{ idempotentReplay: boolean }>;
}
