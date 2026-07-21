type CostField = { unitCost?: string | null };

export function redactInventoryBatch<T extends CostField>(
  batch: T,
  canViewCost: boolean,
): Omit<T, 'unitCost'> | T {
  if (canViewCost) return batch;
  const { unitCost: _removed, ...rest } = batch;
  return rest;
}

export function redactInventoryMovement<T extends CostField>(
  movement: T,
  canViewCost: boolean,
): Omit<T, 'unitCost'> | T {
  if (canViewCost) return movement;
  const { unitCost: _removed, ...rest } = movement;
  return rest;
}

export function redactInventoryBalances<T extends CostField>(
  rows: T[],
  canViewCost: boolean,
): Array<Omit<T, 'unitCost'> | T> {
  return rows.map((row) => redactInventoryBatch(row, canViewCost));
}
