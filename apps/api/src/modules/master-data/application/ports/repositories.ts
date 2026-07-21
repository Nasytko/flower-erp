import type {
  InventoryPolicyPresetCode,
  InventoryPolicyProps,
  ItemCategoryProps,
  ItemProps,
  ItemType,
  MasterDataStatus,
  SupplierProps,
  TrackingMethod,
  UnitOfMeasureProps,
} from '../../domain/master-data-rules';

export const SUPPLIER_REPOSITORY = Symbol('SUPPLIER_REPOSITORY');
export const ITEM_CATEGORY_REPOSITORY = Symbol('ITEM_CATEGORY_REPOSITORY');
export const UNIT_OF_MEASURE_REPOSITORY = Symbol('UNIT_OF_MEASURE_REPOSITORY');
export const INVENTORY_POLICY_REPOSITORY = Symbol('INVENTORY_POLICY_REPOSITORY');
export const ITEM_REPOSITORY = Symbol('ITEM_REPOSITORY');

export type PaginationInput = {
  page: number;
  pageSize: number;
};

export type PaginatedResult<T> = {
  items: T[];
  totalItems: number;
  page: number;
  pageSize: number;
};

export type SortDirection = 'asc' | 'desc';

export type SupplierListFilter = {
  status?: MasterDataStatus;
  name?: string;
};

export type ItemListFilter = {
  categoryId?: string;
  itemType?: ItemType;
  status?: MasterDataStatus;
  name?: string;
  code?: string;
  sortBy?: 'createdAt' | 'name' | 'code';
  sortDir?: SortDirection;
};

export interface SupplierRepository {
  create(data: {
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
  }): Promise<SupplierProps>;
  findById(organizationId: string, id: string): Promise<SupplierProps | null>;
  list(
    organizationId: string,
    pagination: PaginationInput,
    filter: SupplierListFilter,
  ): Promise<PaginatedResult<SupplierProps>>;
  updateStatus(
    organizationId: string,
    id: string,
    status: MasterDataStatus,
  ): Promise<SupplierProps>;
  existsCode(organizationId: string, code: string): Promise<boolean>;
}

export interface ItemCategoryRepository {
  create(data: {
    id: string;
    organizationId: string;
    name: string;
    code: string;
    parentId: string | null;
    status: MasterDataStatus;
  }): Promise<ItemCategoryProps>;
  findById(organizationId: string, id: string): Promise<ItemCategoryProps | null>;
  list(
    organizationId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResult<ItemCategoryProps>>;
  updateStatus(
    organizationId: string,
    id: string,
    status: MasterDataStatus,
  ): Promise<ItemCategoryProps>;
  existsCode(organizationId: string, code: string): Promise<boolean>;
  countChildren(organizationId: string, parentId: string): Promise<number>;
  countItems(organizationId: string, categoryId: string): Promise<number>;
  getParentId(organizationId: string, id: string): Promise<string | null>;
}

export interface UnitOfMeasureRepository {
  create(data: {
    id: string;
    organizationId: string;
    name: string;
    symbol: string;
    quantityScale: number;
    status: MasterDataStatus;
  }): Promise<UnitOfMeasureProps>;
  findById(organizationId: string, id: string): Promise<UnitOfMeasureProps | null>;
  list(
    organizationId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResult<UnitOfMeasureProps>>;
  updateStatus(
    organizationId: string,
    id: string,
    status: MasterDataStatus,
  ): Promise<UnitOfMeasureProps>;
  existsSymbol(organizationId: string, symbol: string): Promise<boolean>;
  countItems(organizationId: string, unitId: string): Promise<number>;
}

export interface InventoryPolicyRepository {
  create(data: {
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
  }): Promise<InventoryPolicyProps>;
  findById(organizationId: string, id: string): Promise<InventoryPolicyProps | null>;
  list(
    organizationId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResult<InventoryPolicyProps>>;
  updateStatus(
    organizationId: string,
    id: string,
    status: MasterDataStatus,
  ): Promise<InventoryPolicyProps>;
  countItems(organizationId: string, policyId: string): Promise<number>;
  findByPresetCode(
    organizationId: string,
    presetCode: InventoryPolicyPresetCode,
  ): Promise<InventoryPolicyProps | null>;
}

export interface ItemRepository {
  create(data: {
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
  }): Promise<ItemProps>;
  findById(organizationId: string, id: string): Promise<ItemProps | null>;
  list(
    organizationId: string,
    pagination: PaginationInput,
    filter: ItemListFilter,
  ): Promise<PaginatedResult<ItemProps>>;
  updateStatus(
    organizationId: string,
    id: string,
    status: MasterDataStatus,
  ): Promise<ItemProps>;
  existsCode(organizationId: string, code: string): Promise<boolean>;
}
