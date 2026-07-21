import { Inject, Injectable } from '@nestjs/common';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import {
  INVENTORY_QUERY_REPOSITORY,
  type InventoryQueryRepository,
} from './ports/inventory-query.repository';

@Injectable()
export class InventoryQueryUseCases {
  constructor(
    @Inject(INVENTORY_QUERY_REPOSITORY)
    private readonly inventory: InventoryQueryRepository,
    private readonly organizations: OrganizationUseCases,
  ) {}

  async listBalances(organizationId: string, storeId: string, warehouseId: string) {
    await this.organizations.getWarehouse(organizationId, storeId, warehouseId);
    return this.inventory.listBalances(organizationId, storeId, warehouseId);
  }

  async listBatches(organizationId: string, storeId: string, warehouseId: string) {
    await this.organizations.getWarehouse(organizationId, storeId, warehouseId);
    return this.inventory.listBatches(organizationId, storeId, warehouseId);
  }

  async listMovements(organizationId: string, storeId: string, warehouseId: string) {
    await this.organizations.getWarehouse(organizationId, storeId, warehouseId);
    return this.inventory.listMovements(organizationId, storeId, warehouseId);
  }
}
