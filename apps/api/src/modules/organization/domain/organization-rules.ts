export enum OrganizationStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

export enum StoreStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum WarehouseStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum WarehouseType {
  STORE = 'STORE',
}

export type OrganizationProps = {
  id: string;
  name: string;
  status: OrganizationStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type StoreProps = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  address: string | null;
  timezone: string;
  status: StoreStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type WarehouseProps = {
  id: string;
  organizationId: string;
  storeId: string;
  name: string;
  code: string;
  type: WarehouseType;
  isDefault: boolean;
  status: WarehouseStatus;
  createdAt: Date;
  updatedAt: Date;
};

export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function normalizeStoreCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) {
    throw new DomainError(
      'INVALID_STORE_CODE',
      'Store code must be 2–32 chars: letters, digits, underscore, hyphen',
    );
  }
  return code;
}

export function normalizeWarehouseCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) {
    throw new DomainError(
      'INVALID_WAREHOUSE_CODE',
      'Warehouse code must be 2–32 chars: letters, digits, underscore, hyphen',
    );
  }
  return code;
}

export function assertOrganizationName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 200) {
    throw new DomainError('INVALID_ORGANIZATION_NAME', 'Organization name must be 2–200 characters');
  }
  return trimmed;
}

export function assertStoreName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 200) {
    throw new DomainError('INVALID_STORE_NAME', 'Store name must be 2–200 characters');
  }
  return trimmed;
}

export function canArchiveOrganization(status: OrganizationStatus): void {
  if (status === OrganizationStatus.ARCHIVED) {
    throw new DomainError('ORGANIZATION_ALREADY_ARCHIVED', 'Organization is already archived');
  }
}

export function canArchiveStore(status: StoreStatus): void {
  if (status === StoreStatus.ARCHIVED) {
    throw new DomainError('STORE_ALREADY_ARCHIVED', 'Store is already archived');
  }
}

export function canCreateStoreInOrganization(status: OrganizationStatus): void {
  if (status !== OrganizationStatus.ACTIVE) {
    throw new DomainError(
      'ORGANIZATION_NOT_ACTIVE',
      'Stores can only be created for an ACTIVE organization',
    );
  }
}

export function defaultWarehouseName(storeName: string): string {
  return `${storeName} — основной`;
}

export function defaultWarehouseCode(): string {
  return 'MAIN';
}

export function assertSingleDefaultWarehouse(isDefault: boolean, alreadyHasDefault: boolean): void {
  if (isDefault && alreadyHasDefault) {
    throw new DomainError(
      'DEFAULT_WAREHOUSE_EXISTS',
      'Store already has a default warehouse',
    );
  }
}
