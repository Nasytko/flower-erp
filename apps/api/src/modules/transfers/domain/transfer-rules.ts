export enum TransferStatus {
  DRAFT = 'DRAFT',
  DISPATCHED = 'DISPATCHED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
  REVERSED = 'REVERSED',
}

export class TransferRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function assertCanEdit(status: TransferStatus): void {
  if (status !== TransferStatus.DRAFT) {
    throw new TransferRuleError('TRANSFER_NOT_DRAFT', 'Only draft transfers can be edited');
  }
}

export function assertCanDispatch(status: TransferStatus): void {
  if (status !== TransferStatus.DRAFT) {
    throw new TransferRuleError('TRANSFER_NOT_DRAFT', 'Only draft transfers can be dispatched');
  }
}

export function assertCanReceive(status: TransferStatus): void {
  if (status !== TransferStatus.DISPATCHED) {
    throw new TransferRuleError(
      'TRANSFER_NOT_DISPATCHED',
      'Only dispatched transfers can be received',
    );
  }
}

export function assertCanCancel(status: TransferStatus): void {
  if (status !== TransferStatus.DRAFT && status !== TransferStatus.DISPATCHED) {
    throw new TransferRuleError(
      'TRANSFER_NOT_CANCELLABLE',
      'Only draft or dispatched transfers can be cancelled',
    );
  }
}

export function assertCanReverse(status: TransferStatus): void {
  if (status !== TransferStatus.DISPATCHED && status !== TransferStatus.RECEIVED) {
    throw new TransferRuleError(
      'TRANSFER_NOT_REVERSIBLE',
      'Only dispatched or received transfers can be reversed',
    );
  }
}
