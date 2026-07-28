import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { SupplyStatus } from '../domain/supply-rules';

export class StoreParamsDto {
  @IsUUID() organizationId!: string;
  @IsUUID() storeId!: string;
}
export class SupplyParamsDto extends StoreParamsDto { @IsUUID() supplyId!: string; }
export class ReceiptParamsDto extends StoreParamsDto { @IsUUID() goodsReceiptId!: string; }
export class CreateSupplyDto {
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsUUID() supplierId!: string;
  @IsOptional() @IsDateString() expectedReceiptDate?: string;
  @IsOptional() @IsDateString() receivedDate?: string;
  @IsOptional() @IsDateString() paymentDueDate?: string;
  @IsOptional() @IsString() @MaxLength(100) supplierDocumentNumber?: string;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}
export class UpdateSupplyDto {
  @IsOptional() @IsDateString() receivedDate?: string;
  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsDateString()
  paymentDueDate?: string | null;
  @IsOptional() @IsString() @MaxLength(100) supplierDocumentNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string | null;
}
export class SupplyItemDto {
  @IsUUID() itemId!: string;
  @IsString() orderedQuantity!: string;
  @IsOptional() @IsString() plannedUnitPrice?: string;
}
export class UpdateSupplyItemDto {
  @IsString() orderedQuantity!: string;
  @IsString() plannedUnitPrice!: string;
}
export class ReceiveSupplyDto {
  @IsOptional() @IsDateString() receivedAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}
export class CreateReceiptDto {
  @IsDateString() receivedAt!: string;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}
export class ReceiptItemDto {
  @IsUUID() supplyItemId!: string;
  @IsString() receivedQuantity!: string;
  @IsString() acceptedQuantity!: string;
  @IsString() defectiveQuantity!: string;
  @IsString() actualUnitPrice!: string;
  @IsOptional() @IsString() @MaxLength(1000) defectReason?: string;
}
export class ListSuppliesQueryDto {
  @IsOptional() @IsEnum(SupplyStatus) status?: SupplyStatus;
}
