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

  @ApiPropertyOptional({
    example: 'MSK-01',
    description: 'Optional; auto-generated when omitted',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 'Минск' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ example: 'Europe/Moscow' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class UpdateStoreDto {
  @ApiPropertyOptional({ example: 'Central Salon' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ example: 'Минск' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ example: 'Europe/Moscow' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ example: 'Центральный — основной' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;
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

export class UpdateIntegrationSettingsDto {
  @IsString()
  geocodingProvider!: string;

  @IsOptional()
  @IsString()
  yandexMapsApiKey?: string | null;

  @IsString()
  navigationProvider!: string;

  @IsOptional()
  @IsString()
  mapDefaultLatitude?: string | null;

  @IsOptional()
  @IsString()
  mapDefaultLongitude?: string | null;
}
