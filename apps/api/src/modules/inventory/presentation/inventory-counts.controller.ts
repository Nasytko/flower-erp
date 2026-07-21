import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { InventoryCountUseCases } from '../application/inventory-count.use-cases';

class StoreParamsDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  storeId!: string;
}

class CountParamsDto extends StoreParamsDto {
  @IsUUID()
  inventoryCountId!: string;
}

class CreateInventoryCountDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  comment?: string | null;
}

class CountItemEntryDto {
  @IsUUID()
  inventoryCountItemId!: string;

  @IsString()
  @MinLength(1)
  countedQuantity!: string;
}

class CountItemsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountItemEntryDto)
  items!: CountItemEntryDto[];
}

class PostInventoryCountDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

@ApiTags('inventory-counts')
@RequirePermissions('inventory-counts:read')
@Controller('organizations/:organizationId/stores/:storeId/inventory-counts')
export class InventoryCountsController {
  constructor(private readonly counts: InventoryCountUseCases) {}

  @Get()
  list(@Param() params: StoreParamsDto) {
    return this.counts.list(params.organizationId, params.storeId);
  }

  @Get(':inventoryCountId')
  get(@Param() params: CountParamsDto) {
    return this.counts.get(params.organizationId, params.storeId, params.inventoryCountId);
  }

  @Post()
  @RequirePermissions('inventory-counts:create')
  create(@Param() params: StoreParamsDto, @Body() body: CreateInventoryCountDto) {
    return this.counts.create({
      organizationId: params.organizationId,
      storeId: params.storeId,
      warehouseId: body.warehouseId,
      comment: body.comment,
    });
  }

  @Post(':inventoryCountId/count')
  @RequirePermissions('inventory-counts:count')
  count(@Param() params: CountParamsDto, @Body() body: CountItemsDto) {
    return this.counts.count({
      organizationId: params.organizationId,
      storeId: params.storeId,
      inventoryCountId: params.inventoryCountId,
      expectedVersion: body.expectedVersion,
      items: body.items,
    });
  }

  @Post(':inventoryCountId/post')
  @RequirePermissions('inventory-counts:post')
  post(
    @Param() params: CountParamsDto,
    @Body() body: PostInventoryCountDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.counts.post({
      organizationId: params.organizationId,
      storeId: params.storeId,
      inventoryCountId: params.inventoryCountId,
      expectedVersion: body.expectedVersion,
      idempotencyKey: idempotencyKey ?? '',
    });
  }

  @Post(':inventoryCountId/cancel')
  @RequirePermissions('inventory-counts:cancel')
  cancel(@Param() params: CountParamsDto) {
    return this.counts.cancel({
      organizationId: params.organizationId,
      storeId: params.storeId,
      inventoryCountId: params.inventoryCountId,
    });
  }
}
