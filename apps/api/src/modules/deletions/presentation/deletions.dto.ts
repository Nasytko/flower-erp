import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class OrganizationParamsDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;
}

export class DeletionRequestParamsDto extends OrganizationParamsDto {
  @ApiProperty()
  @IsUUID()
  requestId!: string;
}

const DELETION_ENTITY_TYPES = [
  'ITEM',
  'SUPPLIER',
  'CATEGORY',
  'INVENTORY_POLICY',
  'CUSTOMER',
  'USER',
  'COURIER',
  'PAYMENT_METHOD',
] as const;

const DELETION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

export class CreateDeletionRequestDto {
  @ApiProperty({ enum: DELETION_ENTITY_TYPES })
  @IsEnum(DELETION_ENTITY_TYPES)
  entityType!: (typeof DELETION_ENTITY_TYPES)[number];

  @ApiProperty()
  @IsUUID()
  entityId!: string;

  @ApiProperty({ description: 'Human-readable label shown in approval queue' })
  @IsString()
  @MaxLength(300)
  entityLabel!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReviewDeletionRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class ListDeletionRequestsQueryDto {
  @ApiPropertyOptional({ enum: DELETION_STATUSES })
  @IsOptional()
  @IsEnum(DELETION_STATUSES)
  status?: (typeof DELETION_STATUSES)[number];
}
