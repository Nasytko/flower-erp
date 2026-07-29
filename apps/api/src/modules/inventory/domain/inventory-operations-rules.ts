export class InventoryOperationRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

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
