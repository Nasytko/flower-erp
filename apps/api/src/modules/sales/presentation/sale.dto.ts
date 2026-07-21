import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DiscountReason,
  DiscountType,
  SaleStatus,
  SaleType,
  SalesChannel,
} from '../domain/sale-rules';

export class StoreParamsDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  storeId!: string;
}

export class SaleParamsDto extends StoreParamsDto {
  @IsUUID()
  saleId!: string;
}

export class DiscountDto {
  @IsEnum(DiscountType)
  type!: DiscountType;

  @IsString()
  value!: string;

  @IsEnum(DiscountReason)
  reason!: DiscountReason;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class CreateSaleFromOrderDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsEnum(SalesChannel)
  salesChannel?: SalesChannel;

  @IsOptional()
  @IsString()
  unitPrice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;
}

export class DirectSaleLineDto {
  @IsUUID()
  itemId!: string;

  @IsString()
  quantity!: string;

  @IsString()
  unitPrice!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateDirectSaleDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsEnum(SalesChannel)
  salesChannel?: SalesChannel;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DirectSaleLineDto)
  lines!: DirectSaleLineDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;
}

export class AnnulSaleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}

export class ListSalesQueryDto {
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsEnum(SaleType)
  type?: SaleType;

  @IsOptional()
  @IsUUID()
  orderId?: string;
}
