import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import {
  CourierStatus,
  DeliveryMethod,
  DeliveryProblemType,
  DeliveryStatus,
  RoutePlanStatus,
} from '../domain/delivery-rules';

export class StoreParamsDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  storeId!: string;
}

export class DeliveryParamsDto extends StoreParamsDto {
  @IsUUID()
  deliveryId!: string;
}

export class OrderDeliveryParamsDto extends StoreParamsDto {
  @IsUUID()
  orderId!: string;
}

export class CourierParamsDto extends StoreParamsDto {
  @IsUUID()
  courierId!: string;
}

export class RouteParamsDto extends StoreParamsDto {
  @IsUUID()
  routeId!: string;
}

export class ProblemParamsDto extends DeliveryParamsDto {
  @IsUUID()
  problemId!: string;
}

export class ExpectedVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CreateDeliveryDto {
  @IsEnum(DeliveryMethod)
  method!: DeliveryMethod;

  @IsISO8601()
  deliveryDate!: string;

  @IsISO8601()
  windowStart!: string;

  @IsISO8601()
  windowEnd!: string;

  @IsOptional()
  @IsISO8601()
  requiredDispatchAt?: string | null;

  @IsOptional()
  @IsString()
  recipientName?: string | null;

  @IsOptional()
  @IsString()
  recipientPhone?: string | null;

  @IsString()
  @MinLength(1)
  addressLine!: string;

  @IsString()
  @MinLength(1)
  city!: string;

  @IsOptional()
  @IsString()
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  entrance?: string | null;

  @IsOptional()
  @IsString()
  floor?: string | null;

  @IsOptional()
  @IsString()
  apartment?: string | null;

  @IsOptional()
  @IsString()
  accessCode?: string | null;

  @IsOptional()
  @IsString()
  deliveryComment?: string | null;

  @IsOptional()
  @IsString()
  deliveryFee?: string;

  @IsOptional()
  @IsString()
  externalReference?: string | null;

  @IsOptional()
  @IsString()
  providerName?: string | null;
}

export class PlanDeliveryDto extends ExpectedVersionDto {
  @IsOptional()
  @IsISO8601()
  deliveryDate?: string;

  @IsOptional()
  @IsISO8601()
  windowStart?: string;

  @IsOptional()
  @IsISO8601()
  windowEnd?: string;

  @IsOptional()
  @IsISO8601()
  requiredDispatchAt?: string | null;

  @IsOptional()
  @IsEnum(DeliveryMethod)
  method?: DeliveryMethod;

  @IsOptional()
  @IsString()
  deliveryFee?: string;

  @IsOptional()
  @IsString()
  externalReference?: string | null;

  @IsOptional()
  @IsString()
  providerName?: string | null;
}

export class UpdateAddressDto extends ExpectedVersionDto {
  @IsString()
  @MinLength(1)
  addressLine!: string;

  @IsString()
  @MinLength(1)
  city!: string;

  @IsOptional()
  @IsString()
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  entrance?: string | null;

  @IsOptional()
  @IsString()
  floor?: string | null;

  @IsOptional()
  @IsString()
  apartment?: string | null;

  @IsOptional()
  @IsString()
  accessCode?: string | null;

  @IsOptional()
  @IsString()
  deliveryComment?: string | null;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  recipientPhone?: string;
}

export class SetCoordinatesDto extends ExpectedVersionDto {
  @IsString()
  latitude!: string;

  @IsString()
  longitude!: string;
}

export class AssignCourierDto extends ExpectedVersionDto {
  @IsUUID()
  courierProfileId!: string;
}

export class ReleaseCourierDto extends ExpectedVersionDto {
  @IsOptional()
  @IsString()
  reason?: string | null;
}

export class CancelDeliveryDto extends ExpectedVersionDto {
  @IsOptional()
  @IsString()
  reason?: string | null;
}

export class ReportProblemDto extends ExpectedVersionDto {
  @IsEnum(DeliveryProblemType)
  type!: DeliveryProblemType;

  @IsString()
  @MinLength(1)
  description!: string;
}

export class ResolveProblemDto extends ExpectedVersionDto {
  @IsString()
  @MinLength(1)
  resolution!: string;

  @IsEnum(DeliveryStatus)
  resolveToStatus!: DeliveryStatus;
}

export class CreateCourierDto {
  @IsUUID()
  membershipId!: string;

  @IsString()
  @MinLength(1)
  displayNameSnapshot!: string;

  @IsOptional()
  @IsString()
  phoneSnapshot?: string | null;

  @IsOptional()
  @IsString()
  vehicleType?: string | null;

  @IsOptional()
  @IsString()
  vehicleDescription?: string | null;
}

export class CreateRouteDto {
  @IsISO8601()
  serviceDate!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsUUID()
  courierProfileId?: string | null;
}

export class AddRouteStopsDto extends ExpectedVersionDto {
  @IsArray()
  @IsUUID('4', { each: true })
  deliveryJobIds!: string[];
}

export class ReorderRouteDto extends ExpectedVersionDto {
  @IsArray()
  @IsUUID('4', { each: true })
  orderedDeliveryJobIds!: string[];
}

export class ListDeliveriesQueryDto {
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @IsOptional()
  @IsISO8601()
  deliveryDate?: string;

  @IsOptional()
  @IsUUID()
  courierId?: string;
}

export class BoardQueryDto {
  @IsOptional()
  @IsISO8601()
  date?: string;
}

export class ListCouriersQueryDto {
  @IsOptional()
  @IsEnum(CourierStatus)
  status?: CourierStatus;
}

export class ListRoutesQueryDto {
  @IsOptional()
  @IsISO8601()
  serviceDate?: string;

  @IsOptional()
  @IsEnum(RoutePlanStatus)
  status?: RoutePlanStatus;
}
