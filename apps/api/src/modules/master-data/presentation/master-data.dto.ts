import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ItemType,
  InventoryPolicyPresetCode,
  MasterDataStatus,
  TrackingMethod,
} from '../domain/master-data-rules';

export class OrganizationIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  organizationId!: string;
}

export class SupplierIdParamDto extends OrganizationIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId!: string;
}

export class CategoryIdParamDto extends OrganizationIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;
}

export class UnitIdParamDto extends OrganizationIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId!: string;
}

export class PolicyIdParamDto extends OrganizationIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  policyId!: string;
}

export class ItemIdParamDto extends OrganizationIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;
}

export class ArchiveDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class CreateSupplierDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'SUP-01' })
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactPerson?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ListSuppliersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MasterDataStatus })
  @IsOptional()
  @IsEnum(MasterDataStatus)
  status?: MasterDataStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'ROSES' })
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class CreateUnitDto {
  @ApiProperty({ example: 'Штука' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'шт' })
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  symbol!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 3, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  quantityScale?: number;
}

export class CreatePolicyDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: ItemType })
  @IsEnum(ItemType)
  itemType!: ItemType;

  @ApiProperty({ enum: TrackingMethod })
  @IsEnum(TrackingMethod)
  trackingMethod!: TrackingMethod;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  reservationAllowed?: boolean;

  @ApiProperty()
  @IsBoolean()
  expirationTracking!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  defaultShelfLifeDays?: number;

  @ApiPropertyOptional({ enum: ['FLOWER_DEFAULT', 'MATERIAL_UNIT', 'MATERIAL_FRACTIONAL'] })
  @IsOptional()
  @IsIn(['FLOWER_DEFAULT', 'MATERIAL_UNIT', 'MATERIAL_FRACTIONAL'])
  presetCode?: InventoryPolicyPresetCode;
}

export class CreateItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  inventoryPolicyId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'ROSE-RED-60' })
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code!: string;

  @ApiProperty({ enum: ItemType })
  @IsEnum(ItemType)
  itemType!: ItemType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPurchasable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isSellable?: boolean;
}

export class ListItemsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ItemType })
  @IsOptional()
  @IsEnum(ItemType)
  itemType?: ItemType;

  @ApiPropertyOptional({ enum: MasterDataStatus })
  @IsOptional()
  @IsEnum(MasterDataStatus)
  status?: MasterDataStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'name', 'code'] })
  @IsOptional()
  @IsIn(['createdAt', 'name', 'code'])
  sortBy?: 'createdAt' | 'name' | 'code';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
