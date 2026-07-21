import { Prisma } from '@prisma/client';

type MovementType =
  | 'RECEIPT'
  | 'RECEIPT_REVERSAL'
  | 'ISSUE'
  | 'ISSUE_REVERSAL'
  | 'WRITE_OFF'
  | 'WRITE_OFF_REVERSAL'
  | 'TRANSFER_OUT'
  | 'TRANSFER_OUT_REVERSAL'
  | 'TRANSFER_IN'
  | 'TRANSFER_IN_REVERSAL'
  | 'COUNT_ADJUSTMENT_OUT'
  | 'COUNT_ADJUSTMENT_IN';

export function signedMovementDelta(
  type: MovementType,
  quantity: Prisma.Decimal,
): Prisma.Decimal {
  switch (type) {
    case 'RECEIPT':
    case 'WRITE_OFF_REVERSAL':
    case 'TRANSFER_IN':
    case 'COUNT_ADJUSTMENT_IN':
    case 'ISSUE_REVERSAL':
    case 'TRANSFER_OUT_REVERSAL':
      return quantity;
    case 'RECEIPT_REVERSAL':
    case 'WRITE_OFF':
    case 'TRANSFER_OUT':
    case 'COUNT_ADJUSTMENT_OUT':
    case 'ISSUE':
    case 'TRANSFER_IN_REVERSAL':
      return quantity.negated();
    default:
      return new Prisma.Decimal(0);
  }
}
