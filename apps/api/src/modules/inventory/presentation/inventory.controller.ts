import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { hasPermission } from '@flower/permissions';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { CurrentAuthContext } from '../../auth/presentation/current-auth-context.decorator';
import type { AuthContext } from '../../../infrastructure/context/request-context';
import { InventoryQueryUseCases } from '../application/inventory-query.use-cases';
import {
  redactInventoryBatch,
  redactInventoryMovement,
} from './inventory.presenter';

class InventoryParamsDto {
  organizationId!: string;
  storeId!: string;
  warehouseId!: string;
}

@ApiTags('inventory')
@RequirePermissions('inventory:read')
@Controller('organizations/:organizationId/stores/:storeId/warehouses/:warehouseId')
export class InventoryController {
  constructor(private readonly inventory: InventoryQueryUseCases) {}

  @Get('inventory')
  balances(@Param() params: InventoryParamsDto) {
    return this.inventory.listBalances(
      params.organizationId,
      params.storeId,
      params.warehouseId,
    );
  }

  @Get('batches')
  async batches(
    @Param() params: InventoryParamsDto,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const canViewCost = hasPermission(auth.permissions, ['inventory:view-cost']);
    const rows = await this.inventory.listBatches(
      params.organizationId,
      params.storeId,
      params.warehouseId,
    );
    return rows.map((row) => redactInventoryBatch(row, canViewCost));
  }

  @Get('movements')
  async movements(
    @Param() params: InventoryParamsDto,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const canViewCost = hasPermission(auth.permissions, ['inventory:view-cost']);
    const rows = await this.inventory.listMovements(
      params.organizationId,
      params.storeId,
      params.warehouseId,
    );
    return rows.map((row) => redactInventoryMovement(row, canViewCost));
  }
}
