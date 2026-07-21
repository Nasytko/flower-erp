import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { hasAnyPermission } from '@flower/permissions';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { CurrentAuthContext } from '../../auth/presentation/current-auth-context.decorator';
import type { AuthContext } from '../../../infrastructure/context/request-context';
import { WorkspaceQueryUseCases } from '../application/workspace-query.use-cases';
import type { WorkspaceFilter } from '../application/ports/workspace-read.repository';

class StoreParamsDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  storeId!: string;
}

class WorkOrderParamsDto extends StoreParamsDto {
  @IsUUID()
  orderId!: string;
}

class WorkspaceOrdersQueryDto {
  @IsEnum([
    'overdue',
    'soon',
    'unassigned',
    'in_preparation',
    'ready',
    'today',
    'partially_reserved',
    'all_open',
  ])
  filter!: WorkspaceFilter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@ApiTags('workspace')
@Controller('organizations/:organizationId/stores/:storeId')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceQueryUseCases) {}

  @Get('workspace/today')
  today(@Param() params: StoreParamsDto, @CurrentAuthContext() auth: AuthContext) {
    this.assertWorkspaceOrOrders(auth);
    return this.workspace.getToday(params.organizationId, params.storeId);
  }

  @Get('workspace/orders')
  listOrders(
    @Param() params: StoreParamsDto,
    @Query() query: WorkspaceOrdersQueryDto,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    this.assertWorkspaceOrOrders(auth);
    return this.workspace.listWorkspaceOrders({
      organizationId: params.organizationId,
      storeId: params.storeId,
      filter: query.filter,
      offset: query.offset ?? 0,
      limit: query.limit ?? 20,
    });
  }

  @Get('workspace/orders/:orderId')
  workOrder(
    @Param() params: WorkOrderParamsDto,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    this.assertWorkspaceOrOrders(auth);
    return this.workspace.getWorkOrder(
      params.organizationId,
      params.storeId,
      params.orderId,
    );
  }

  @Get('operations')
  @RequirePermissions('operations:read')
  operations(@Param() params: StoreParamsDto) {
    return this.workspace.getOperations(params.organizationId, params.storeId);
  }

  @Get('stock/operational')
  stock(@Param() params: StoreParamsDto, @CurrentAuthContext() auth: AuthContext) {
    this.assertWorkspaceOrOrders(auth);
    return this.workspace.getOperationalStock(params.organizationId, params.storeId);
  }

  @Get('operations/inventory/attention')
  @RequirePermissions('operations:read')
  inventoryAttention(@Param() params: StoreParamsDto) {
    return this.workspace.getInventoryOpsAttention(params.organizationId, params.storeId);
  }

  @Get('operations/inventory/in-transit')
  @RequirePermissions('operations:read')
  inventoryInTransit(@Param() params: StoreParamsDto) {
    return this.workspace.getInventoryTransit(params.organizationId, params.storeId);
  }

  @Get('operations/inventory/losses')
  @RequirePermissions('operations:read')
  inventoryLosses(@Param() params: StoreParamsDto) {
    return this.workspace.getInventoryLosses(params.organizationId, params.storeId);
  }

  @Get('operations/inventory/count-progress')
  @RequirePermissions('operations:read')
  inventoryCountProgress(@Param() params: StoreParamsDto) {
    return this.workspace.getInventoryCountProgress(params.organizationId, params.storeId);
  }

  private assertWorkspaceOrOrders(auth: AuthContext): void {
    if (!hasAnyPermission(auth.permissions, ['workspace:read', 'orders:read'])) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'workspace:read or orders:read required',
      });
    }
  }
}
