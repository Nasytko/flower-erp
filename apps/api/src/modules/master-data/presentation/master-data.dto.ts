import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
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

  @ApiPropertyOptional({ example: 'VND-01', description: 'Optional; auto-generated when omitted' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code?: string;

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

  @ApiPropertyOptional({ example: 'ROSES', description: 'Optional; auto-generated when omitted' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code?: string;

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
  @ApiPropertyOptional({ format: 'uuid', description: 'Optional; defaults to «Общее» category' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional; defaults to шт' })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional; defaults to preset policy for itemType',
  })
  @IsOptional()
  @IsUUID()
  inventoryPolicyId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    example: 'ROSE-RED-60',
    description: 'Optional; auto-generated when omitted',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code?: string;

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

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isShowcase?: boolean;

  @ApiPropertyOptional({
    example: '10',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  minimumStockQuantity?: string | null;
}

export class UpdateItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Low-stock alert threshold; null clears the threshold.',
    example: '10',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  minimumStockQuantity?: string | null;

  @ApiPropertyOptional({ description: 'Mark as showcase bouquet for order templates' })
  @IsOptional()
  @IsBoolean()
  isShowcase?: boolean;
}

export class ItemRecipeLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  componentItemId!: string;

  @ApiProperty({ example: '7' })
  @IsString()
  @MinLength(1)
  quantity!: string;
}

export class SetItemRecipeDto {
  @ApiProperty({ type: [ItemRecipeLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemRecipeLineDto)
  lines!: ItemRecipeLineDto[];
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

  @ApiPropertyOptional({ description: 'Filter by ready-bouquet flag' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isSellable?: boolean;

  @ApiPropertyOptional({ enum: ['createdAt', 'name', 'code'] })
  @IsOptional()
  @IsIn(['createdAt', 'name', 'code'])
  sortBy?: 'createdAt' | 'name' | 'code';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}

export class ListRetailPricesQueryDto {
  @ApiProperty({ description: 'Week start or effective date (YYYY-MM-DD)' })
  @IsString()
  effectiveFrom!: string;
}

export class RetailPriceEntryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ example: '12.50' })
  @IsString()
  amount!: string;
}

export class UpsertRetailPricesDto {
  @ApiProperty({ description: 'Week start or effective date (YYYY-MM-DD)' })
  @IsString()
  effectiveFrom!: string;

  @ApiProperty({ type: [RetailPriceEntryDto] })
  prices!: RetailPriceEntryDto[];
}

export class ResolveRetailCompositionLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ example: '3' })
  @IsString()
  quantity!: string;
}

export class ResolveRetailCompositionDto {
  @ApiPropertyOptional({ description: 'Pricing date (YYYY-MM-DD), default today' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiProperty({ type: [ResolveRetailCompositionLineDto] })
  lines!: ResolveRetailCompositionLineDto[];
}
