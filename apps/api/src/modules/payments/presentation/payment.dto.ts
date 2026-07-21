import {
  IsArray,
  IsBoolean,
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
  PaymentAllocationTargetType,
  PaymentMethodType,
  PaymentStatus,
  PaymentType,
} from '../domain/payment-rules';

export class StoreParamsDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  storeId!: string;
}

export class PaymentParamsDto extends StoreParamsDto {
  @IsUUID()
  paymentId!: string;
}

export class RefundParamsDto extends StoreParamsDto {
  @IsUUID()
  refundId!: string;
}

export class OrderParamsDto extends StoreParamsDto {
  @IsUUID()
  orderId!: string;
}

export class SaleParamsDto extends StoreParamsDto {
  @IsUUID()
  saleId!: string;
}

export class MethodParamsDto extends StoreParamsDto {
  @IsUUID()
  methodId!: string;
}

export class AllocationDto {
  @IsEnum(PaymentAllocationTargetType)
  targetType!: PaymentAllocationTargetType;

  @IsUUID()
  targetId!: string;

  @IsString()
  amount!: string;
}

export class CreatePaymentDto {
  @IsEnum(PaymentType)
  type!: PaymentType;

  @IsUUID()
  methodId!: string;

  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;

  @IsOptional()
  @IsString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalReference?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations!: AllocationDto[];
}

export class CreateTargetPaymentDto {
  @IsUUID()
  methodId!: string;

  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalReference?: string;
}

export class CreatePaymentMethodDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsEnum(PaymentMethodType)
  type!: PaymentMethodType;

  @IsOptional()
  @IsBoolean()
  requiresExternalConfirmation?: boolean;

  @IsOptional()
  sortOrder?: number;
}

export class AnnulReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}

export class CreateRefundDto {
  @IsString()
  amount!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;

  @IsOptional()
  @IsUUID()
  methodId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalReference?: string;
}

export class AllocatePrepaymentsDto {
  @IsOptional()
  @IsUUID()
  saleId?: string;
}

export class ListPaymentsQueryDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentType)
  type?: PaymentType;
}

export class ListMethodsQueryDto {
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  activeOnly?: boolean;
}

export class ListCashOperationsQueryDto {
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;
}
