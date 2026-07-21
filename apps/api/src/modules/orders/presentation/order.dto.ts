import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderOccasion, OrderStatus, OrderType } from '../domain/order-rules';

export class OrgParamsDto {
  @IsUUID()
  organizationId!: string;
}

export class StoreParamsDto extends OrgParamsDto {
  @IsUUID()
  storeId!: string;
}

export class OrderParamsDto extends StoreParamsDto {
  @IsUUID()
  orderId!: string;
}

export class CustomerParamsDto extends OrgParamsDto {
  @IsUUID()
  customerId!: string;
}

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(5)
  phone!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  preferredLanguage?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  preferredLanguage?: string | null;
}

export class CreateOrderDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsEnum(OrderType)
  type?: OrderType;

  @IsOptional()
  @IsEnum(OrderOccasion)
  occasion?: OrderOccasion;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  readyAt?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  referenceUrl?: string;

  @IsOptional()
  @IsString()
  referenceComment?: string;

  @IsOptional()
  @IsString()
  plannedPrice?: string;
}

export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(OrderType)
  type?: OrderType;

  @IsOptional()
  @IsEnum(OrderOccasion)
  occasion?: OrderOccasion;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  readyAt?: string | null;

  @IsOptional()
  @IsString()
  recipientName?: string | null;

  @IsOptional()
  @IsString()
  recipientPhone?: string | null;

  @IsOptional()
  @IsString()
  comment?: string | null;

  @IsOptional()
  @IsString()
  referenceUrl?: string | null;

  @IsOptional()
  @IsString()
  referenceComment?: string | null;

  @IsOptional()
  @IsString()
  plannedPrice?: string | null;
}

export class CompositionItemDto {
  @IsUUID()
  itemId!: string;

  @IsString()
  @MinLength(1)
  plannedQuantity!: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class SetCompositionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompositionItemDto)
  items!: CompositionItemDto[];
}

export class ActualCompositionItemDto {
  @IsUUID()
  itemId!: string;

  @IsString()
  @MinLength(1)
  actualQuantity!: string;

  @IsOptional()
  @IsUUID()
  batchId?: string | null;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class SetActualCompositionDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActualCompositionItemDto)
  items!: ActualCompositionItemDto[];
}

export class AssignFloristDto {
  @IsUUID()
  membershipId!: string;
}

export class ReassignFloristDto {
  @IsUUID()
  membershipId!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}

export class ReleaseAssignmentDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class ReplaceCompositionItemDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;

  @IsUUID()
  fromItemId!: string;

  @IsUUID()
  toItemId!: string;

  @IsString()
  @MinLength(1)
  quantity!: string;

  @IsIn(['OUT_OF_STOCK', 'QUALITY', 'CUSTOMER_REQUEST', 'FLORIST_DECISION', 'OTHER'])
  reason!: 'OUT_OF_STOCK' | 'QUALITY' | 'CUSTOMER_REQUEST' | 'FLORIST_DECISION' | 'OTHER';

  @IsOptional()
  @IsString()
  comment?: string | null;
}

export class AddCommentDto {
  @IsString()
  @MinLength(1)
  message!: string;
}

export class ListOrdersQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

/** @deprecated */
export class OrderItemDto {
  @IsUUID()
  itemId!: string;

  @IsString()
  @MinLength(1)
  quantity!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

/** @deprecated */
export class OrderItemParamsDto extends OrderParamsDto {
  @IsUUID()
  orderItemId!: string;
}
