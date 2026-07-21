import { DomainError } from '../../master-data/domain/master-data-rules';

export enum SupplyStatus {
  DRAFT = 'DRAFT',
  SUBMITTED_TO_SUPPLIER = 'SUBMITTED_TO_SUPPLIER',
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED',
  RECEIVED = 'RECEIVED',
  ANNULLED = 'ANNULLED',
}

export enum GoodsReceiptStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

export function canEditSupplyItems(status: SupplyStatus): void {
  if (status !== SupplyStatus.DRAFT) throw new DomainError('SUPPLY_NOT_EDITABLE', 'Supply items can be edited only in DRAFT');
}

export function canSubmit(status: SupplyStatus, itemCount: number): void {
  if (status !== SupplyStatus.DRAFT) throw new DomainError('SUPPLY_NOT_DRAFT', 'Only DRAFT supplies can be submitted');
  if (itemCount < 1) throw new DomainError('SUPPLY_HAS_NO_ITEMS', 'Supply must have at least one item');
}

export function canAnnul(status: SupplyStatus): void {
  if (status !== SupplyStatus.DRAFT) throw new DomainError('SUPPLY_NOT_ANNULABLE', 'Only DRAFT supplies can be annulled');
}

export function canCreateReceipt(status: SupplyStatus): void {
  if (![SupplyStatus.SUBMITTED_TO_SUPPLIER, SupplyStatus.PARTIALLY_RECEIVED].includes(status)) {
    throw new DomainError('SUPPLY_NOT_RECEIVABLE', 'Goods receipts require a submitted supply');
  }
}

export function assertReceiptLine(received: string, accepted: string, defective: string): void {
  const values = [received, accepted, defective].map((value) => Number(value));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new DomainError('INVALID_RECEIPT_QUANTITY', 'Receipt quantities must be non-negative decimals');
  }
  const [receivedValue, acceptedValue, defectiveValue] = values as [number, number, number];
  if (acceptedValue + defectiveValue > receivedValue) {
    throw new DomainError('RECEIPT_QUANTITY_MISMATCH', 'Accepted plus defective quantity cannot exceed received quantity');
  }
}

export function recalculateSupplyStatus(ordered: string, cumulativeReceived: string): SupplyStatus {
  if (compareQty(cumulativeReceived, '0') <= 0) return SupplyStatus.SUBMITTED_TO_SUPPLIER;
  if (compareQty(cumulativeReceived, ordered) >= 0) return SupplyStatus.RECEIVED;
  return SupplyStatus.PARTIALLY_RECEIVED;
}

/** Compare decimal strings (up to 3 fractional digits). Returns -1 / 0 / 1. */
export function compareQty(a: string, b: string): number {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    throw new DomainError('INVALID_QUANTITY', 'Quantity comparison requires finite decimals');
  }
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function addQty(a: string, b: string): string {
  return (Number(a) + Number(b)).toString();
}

