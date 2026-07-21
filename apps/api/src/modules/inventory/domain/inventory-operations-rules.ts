export class InventoryOperationRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type CountVariance = {
  expectedQuantity: string;
  countedQuantity: string;
  varianceQuantity: string;
  movementType: 'COUNT_ADJUSTMENT_IN' | 'COUNT_ADJUSTMENT_OUT' | null;
};

function asNumber(value: string): number {
  return Number(value);
}

function assertPositive(value: string, code: string, message: string): void {
  if (!Number.isFinite(asNumber(value)) || asNumber(value) <= 0) {
    throw new InventoryOperationRuleError(code, message);
  }
}

export function assertWriteOffLine(quantity: string): void {
  assertPositive(quantity, 'INVALID_WRITE_OFF_QUANTITY', 'Write-off quantity must be positive');
}

export function reconcileCountWithMovements(
  systemQuantityAtCutoff: string,
  netMovementsAfterCutoff: string,
  countedQuantity: string,
): CountVariance {
  const expectedAtPost = asNumber(systemQuantityAtCutoff) + asNumber(netMovementsAfterCutoff);
  return reconcileCount(expectedAtPost.toFixed(3), countedQuantity);
}

export function reconcileCount(expectedQuantity: string, countedQuantity: string): CountVariance {
  if (!Number.isFinite(asNumber(countedQuantity)) || asNumber(countedQuantity) < 0) {
    throw new InventoryOperationRuleError(
      'INVALID_COUNTED_QUANTITY',
      'Counted quantity must be zero or positive',
    );
  }

  const variance = asNumber(countedQuantity) - asNumber(expectedQuantity);
  return {
    expectedQuantity,
    countedQuantity,
    varianceQuantity: variance.toFixed(3),
    movementType:
      variance > 0
        ? 'COUNT_ADJUSTMENT_IN'
        : variance < 0
          ? 'COUNT_ADJUSTMENT_OUT'
          : null,
  };
}

export function weightedAverageUnitCost(
  batches: Array<{ remainingQuantity: string; unitCost: string }>,
): string {
  let totalQty = 0;
  let totalValue = 0;
  for (const batch of batches) {
    const qty = asNumber(batch.remainingQuantity);
    if (qty <= 0) continue;
    totalQty += qty;
    totalValue += qty * asNumber(batch.unitCost);
  }
  if (totalQty <= 0) {
    throw new InventoryOperationRuleError(
      'ZERO_COST_ADJUSTMENT_NOT_ALLOWED',
      'Positive count adjustment requires existing stock for weighted average cost',
    );
  }
  return (totalValue / totalQty).toFixed(4);
}

export function assertTransferDispatch(requestedQuantity: string, dispatchQuantity: string): void {
  assertPositive(
    dispatchQuantity,
    'INVALID_DISPATCH_QUANTITY',
    'Dispatch quantity must be positive',
  );
  if (asNumber(dispatchQuantity) > asNumber(requestedQuantity)) {
    throw new InventoryOperationRuleError(
      'DISPATCH_EXCEEDS_REQUESTED',
      'Dispatch quantity cannot exceed requested quantity',
    );
  }
}

export function assertTransferReceipt(
  dispatchedQuantity: string,
  receivedQuantity: string,
  damagedQuantity: string,
): void {
  if (asNumber(receivedQuantity) < 0 || asNumber(damagedQuantity) < 0) {
    throw new InventoryOperationRuleError(
      'INVALID_RECEIPT_QUANTITY',
      'Received and damaged quantities must be zero or positive',
    );
  }
  if (Number((asNumber(receivedQuantity) + asNumber(damagedQuantity)).toFixed(3)) > asNumber(dispatchedQuantity)) {
    throw new InventoryOperationRuleError(
      'RECEIPT_EXCEEDS_DISPATCHED',
      'Received plus damaged quantity cannot exceed dispatched quantity',
    );
  }
}
