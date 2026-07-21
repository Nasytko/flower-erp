import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Demo Flowers Ltd' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;
}

export class CreateStoreDto {
  @ApiProperty({ example: 'Central Salon' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'MSK-01' })
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 'Europe/Moscow' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
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

export class OrganizationIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  organizationId!: string;
}

export class StoreIdParamDto extends OrganizationIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  storeId!: string;
}

export class WarehouseIdParamDto extends StoreIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  warehouseId!: string;
}
