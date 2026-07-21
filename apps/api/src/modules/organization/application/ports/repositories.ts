import type {
  OrganizationProps,
  StoreProps,
  WarehouseProps,
  OrganizationStatus,
  StoreStatus,
} from '../../domain/organization-rules';

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');
export const STORE_REPOSITORY = Symbol('STORE_REPOSITORY');
export const WAREHOUSE_REPOSITORY = Symbol('WAREHOUSE_REPOSITORY');

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

export interface OrganizationRepository {
  create(data: {
    id: string;
    name: string;
    status: OrganizationStatus;
  }): Promise<OrganizationProps>;
  findById(id: string): Promise<OrganizationProps | null>;
  list(pagination: PaginationInput): Promise<PaginatedResult<OrganizationProps>>;
  findManyByIds(ids: string[], pagination: PaginationInput): Promise<PaginatedResult<OrganizationProps>>;
  updateStatus(id: string, status: OrganizationStatus): Promise<OrganizationProps>;
}

export interface StoreRepository {
  create(data: {
    id: string;
    organizationId: string;
    name: string;
    code: string;
    address: string | null;
    timezone: string;
    status: StoreStatus;
  }): Promise<StoreProps>;
  findById(organizationId: string, storeId: string): Promise<StoreProps | null>;
  listByOrganization(
    organizationId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResult<StoreProps>>;
  updateStatus(
    organizationId: string,
    storeId: string,
    status: StoreStatus,
  ): Promise<StoreProps>;
  existsCode(organizationId: string, code: string): Promise<boolean>;
}

export interface WarehouseRepository {
  create(data: {
    id: string;
    organizationId: string;
    storeId: string;
    name: string;
    code: string;
    isDefault: boolean;
  }): Promise<WarehouseProps>;
  findById(
    organizationId: string,
    storeId: string,
    warehouseId: string,
  ): Promise<WarehouseProps | null>;
  listByStore(
    organizationId: string,
    storeId: string,
  ): Promise<WarehouseProps[]>;
  hasDefault(storeId: string): Promise<boolean>;
}
