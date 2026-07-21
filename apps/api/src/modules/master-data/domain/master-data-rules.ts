export enum MasterDataStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum ItemType {
  FLOWER = 'FLOWER',
  MATERIAL = 'MATERIAL',
}

export enum TrackingMethod {
  LOT = 'LOT',
  NONE = 'NONE',
}

export type SupplierProps = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  country: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  comment: string | null;
  status: MasterDataStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ItemCategoryProps = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  parentId: string | null;
  status: MasterDataStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type UnitOfMeasureProps = {
  id: string;
  organizationId: string;
  name: string;
  symbol: string;
  quantityScale: number;
  status: MasterDataStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type InventoryPolicyProps = {
  id: string;
  organizationId: string;
  name: string;
  itemType: ItemType;
  trackingMethod: TrackingMethod;
  reservationAllowed: boolean;
  expirationTracking: boolean;
  defaultShelfLifeDays: number | null;
  presetCode: InventoryPolicyPresetCode | null;
  status: MasterDataStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ItemProps = {
  id: string;
  organizationId: string;
  categoryId: string;
  unitId: string;
  inventoryPolicyId: string;
  name: string;
  code: string;
  itemType: ItemType;
  description: string | null;
  isPurchasable: boolean;
  isSellable: boolean;
  status: MasterDataStatus;
  createdAt: Date;
  updatedAt: Date;
};

export enum InventoryPolicyPresetCode {
  FLOWER_DEFAULT = 'FLOWER_DEFAULT',
  MATERIAL_UNIT = 'MATERIAL_UNIT',
  MATERIAL_FRACTIONAL = 'MATERIAL_FRACTIONAL',
}

export const INVENTORY_POLICY_PRESETS: Record<
  InventoryPolicyPresetCode,
  Pick<
    InventoryPolicyProps,
    | 'name'
    | 'itemType'
    | 'trackingMethod'
    | 'reservationAllowed'
    | 'expirationTracking'
    | 'defaultShelfLifeDays'
  >
> = {
  [InventoryPolicyPresetCode.FLOWER_DEFAULT]: {
    name: 'Flowers (lot and expiry)',
    itemType: ItemType.FLOWER,
    trackingMethod: TrackingMethod.LOT,
    reservationAllowed: false,
    expirationTracking: true,
    defaultShelfLifeDays: 7,
  },
  [InventoryPolicyPresetCode.MATERIAL_UNIT]: {
    name: 'Materials (unit)',
    itemType: ItemType.MATERIAL,
    trackingMethod: TrackingMethod.NONE,
    reservationAllowed: false,
    expirationTracking: false,
    defaultShelfLifeDays: null,
  },
  [InventoryPolicyPresetCode.MATERIAL_FRACTIONAL]: {
    name: 'Materials (fractional)',
    itemType: ItemType.MATERIAL,
    trackingMethod: TrackingMethod.NONE,
    reservationAllowed: false,
    expirationTracking: false,
    defaultShelfLifeDays: null,
  },
};

export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function normalizeMasterCode(raw: string, label: string): string {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) {
    throw new DomainError(
      `INVALID_${label}_CODE`,
      `${label} code must be 2–32 chars: letters, digits, underscore, hyphen`,
    );
  }
  return code;
}

export function assertEntityName(name: string, label: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 200) {
    throw new DomainError(
      `INVALID_${label}_NAME`,
      `${label} name must be 2–200 characters`,
    );
  }
  return trimmed;
}

export function assertUnitSymbol(symbol: string): string {
  const trimmed = symbol.trim();
  if (trimmed.length < 1 || trimmed.length > 16) {
    throw new DomainError('INVALID_UNIT_SYMBOL', 'Unit symbol must be 1–16 characters');
  }
  return trimmed;
}

export function assertQuantityScale(scale: number): number {
  if (!Number.isInteger(scale) || scale < 0 || scale > 3) {
    throw new DomainError('INVALID_QUANTITY_SCALE', 'quantityScale must be an integer between 0 and 3');
  }
  return scale;
}

export function assertQuantityMatchesScale(quantity: string | number, scale: number): void {
  assertQuantityScale(scale);
  const value = String(quantity).trim();
  if (!/^\d+(?:\.\d+)?$/.test(value) || Number(value) <= 0) {
    throw new DomainError('INVALID_QUANTITY', 'Quantity must be a positive decimal value');
  }
  const fraction = value.split('.')[1]?.length ?? 0;
  if (fraction > scale) {
    throw new DomainError(
      'QUANTITY_SCALE_EXCEEDED',
      `Quantity has ${fraction} fractional digits; unit permits at most ${scale}`,
    );
  }
}

export function assertOptionalText(
  value: string | null | undefined,
  max: number,
): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > max) {
    throw new DomainError('INVALID_TEXT_LENGTH', `Text must be at most ${max} characters`);
  }
  return trimmed;
}

export function canArchiveMasterRecord(status: MasterDataStatus, entity: string): void {
  if (status === MasterDataStatus.ARCHIVED) {
    throw new DomainError(
      `${entity}_ALREADY_ARCHIVED`,
      `${entity} is already archived`,
    );
  }
}

export function assertActiveReference(status: MasterDataStatus, entity: string): void {
  if (status !== MasterDataStatus.ACTIVE) {
    throw new DomainError(
      `${entity}_NOT_ACTIVE`,
      `${entity} must be ACTIVE to be referenced`,
    );
  }
}

export function assertAvailableForNewDocuments(status: MasterDataStatus, entity: string): void {
  assertActiveReference(status, entity);
}

export function assertItemPurchasable(item: Pick<ItemProps, 'status' | 'isPurchasable'>): void {
  assertAvailableForNewDocuments(item.status, 'ITEM');
  if (!item.isPurchasable) {
    throw new DomainError('ITEM_NOT_PURCHASABLE', 'Item is not available for purchasing');
  }
}

/**
 * Flower policies track lots and expiry; material policies do not.
 * Differentiation must go through InventoryPolicy fields (ADR-006), not separate modules.
 */
export function assertInventoryPolicyShape(input: {
  itemType: ItemType;
  trackingMethod: TrackingMethod;
  expirationTracking: boolean;
  defaultShelfLifeDays: number | null;
}): void {
  if (input.itemType === ItemType.FLOWER) {
    if (input.trackingMethod !== TrackingMethod.LOT) {
      throw new DomainError(
        'INVALID_FLOWER_TRACKING',
        'FLOWER inventory policy must use LOT tracking',
      );
    }
    if (!input.expirationTracking) {
      throw new DomainError(
        'INVALID_FLOWER_EXPIRATION',
        'FLOWER inventory policy must enable expiration tracking',
      );
    }
  }

  if (input.itemType === ItemType.MATERIAL) {
    if (input.trackingMethod !== TrackingMethod.NONE) {
      throw new DomainError(
        'INVALID_MATERIAL_TRACKING',
        'MATERIAL inventory policy must use NONE tracking',
      );
    }
    if (input.expirationTracking) {
      throw new DomainError(
        'INVALID_MATERIAL_EXPIRATION',
        'MATERIAL inventory policy must not track expiration',
      );
    }
  }

  if (input.defaultShelfLifeDays != null) {
    if (!Number.isInteger(input.defaultShelfLifeDays) || input.defaultShelfLifeDays < 1) {
      throw new DomainError(
        'INVALID_SHELF_LIFE',
        'defaultShelfLifeDays must be a positive integer when set',
      );
    }
    if (!input.expirationTracking) {
      throw new DomainError(
        'SHELF_LIFE_WITHOUT_EXPIRATION',
        'defaultShelfLifeDays requires expirationTracking',
      );
    }
  }
}

export function assertItemPolicyTypeMatch(itemType: ItemType, policyType: ItemType): void {
  if (itemType !== policyType) {
    throw new DomainError(
      'ITEM_POLICY_TYPE_MISMATCH',
      `Item type ${itemType} cannot use inventory policy for ${policyType}`,
    );
  }
}

export function assertCategoryNotSelfParent(categoryId: string, parentId: string | null): void {
  if (parentId && parentId === categoryId) {
    throw new DomainError(
      'CATEGORY_SELF_PARENT',
      'Category cannot be its own parent',
    );
  }
}

/**
 * Detects whether assigning `newParentId` to `categoryId` would create a cycle
 * in the ancestor chain. `getParentId` returns the parent of a category in the
 * same organization (or null).
 */
export async function assertCategoryNoCycle(
  categoryId: string,
  newParentId: string | null,
  getParentId: (id: string) => Promise<string | null>,
): Promise<void> {
  assertCategoryNotSelfParent(categoryId, newParentId);
  if (!newParentId) {
    return;
  }

  let cursor: string | null = newParentId;
  const seen = new Set<string>([categoryId]);
  while (cursor) {
    if (seen.has(cursor)) {
      throw new DomainError(
        'CATEGORY_CYCLE',
        'Category parent assignment would create a cycle',
      );
    }
    seen.add(cursor);
    cursor = await getParentId(cursor);
  }
}

export function assertCanArchiveCategory(input: {
  status: MasterDataStatus;
  childCount: number;
  itemCount: number;
}): void {
  canArchiveMasterRecord(input.status, 'CATEGORY');
  if (input.childCount > 0) {
    throw new DomainError(
      'CATEGORY_HAS_CHILDREN',
      'Cannot archive category that still has child categories',
    );
  }
  if (input.itemCount > 0) {
    throw new DomainError(
      'CATEGORY_HAS_ITEMS',
      'Cannot archive category that is still used by items',
    );
  }
}

export function assertCanArchiveUnit(input: {
  status: MasterDataStatus;
  itemCount: number;
}): void {
  canArchiveMasterRecord(input.status, 'UNIT');
  if (input.itemCount > 0) {
    throw new DomainError(
      'UNIT_IN_USE',
      'Cannot archive unit of measure that is still used by items',
    );
  }
}

export function assertCanArchivePolicy(input: {
  status: MasterDataStatus;
  itemCount: number;
}): void {
  canArchiveMasterRecord(input.status, 'POLICY');
  if (input.itemCount > 0) {
    throw new DomainError(
      'POLICY_IN_USE',
      'Cannot archive inventory policy that is still used by items',
    );
  }
}
