import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { WriteOffUseCases } from '../application/write-off.use-cases';

class StoreParamsDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  storeId!: string;
}

class WriteOffParamsDto extends StoreParamsDto {
  @IsUUID()
  writeOffId!: string;
}

class CreateWriteOffDto {
  @IsUUID()
  warehouseId!: string;

  @IsEnum(['WILTED', 'BROKEN', 'DAMAGED', 'EXPIRED', 'QUALITY_ISSUE', 'THEFT', 'INTERNAL_USE', 'OTHER'])
  reason!: string;

  @IsOptional()
  @IsString()
  comment?: string | null;
}

class AddWriteOffItemDto {
  @IsUUID()
  itemId!: string;

  @IsString()
  @MinLength(1)
  quantity!: string;
}

@ApiTags('write-offs')
@RequirePermissions('write-offs:read')
@Controller('organizations/:organizationId/stores/:storeId/write-offs')
export class WriteOffsController {
  constructor(private readonly writeOffs: WriteOffUseCases) {}

  @Get()
  list(@Param() params: StoreParamsDto) {
    return this.writeOffs.list(params.organizationId, params.storeId);
  }

  @Get(':writeOffId')
  get(@Param() params: WriteOffParamsDto) {
    return this.writeOffs.get(params.organizationId, params.storeId, params.writeOffId);
  }

  @Post()
  @RequirePermissions('write-offs:create')
  create(@Param() params: StoreParamsDto, @Body() body: CreateWriteOffDto) {
    return this.writeOffs.create({
      organizationId: params.organizationId,
      storeId: params.storeId,
      warehouseId: body.warehouseId,
      reason: body.reason,
      comment: body.comment,
    });
  }

  @Post(':writeOffId/items')
  @RequirePermissions('write-offs:create')
  addItem(@Param() params: WriteOffParamsDto, @Body() body: AddWriteOffItemDto) {
    return this.writeOffs.addItem({
      organizationId: params.organizationId,
      storeId: params.storeId,
      writeOffId: params.writeOffId,
      itemId: body.itemId,
      quantity: body.quantity,
    });
  }

  @Post(':writeOffId/post')
  @RequirePermissions('write-offs:post')
  post(
    @Param() params: WriteOffParamsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.writeOffs.post({
      organizationId: params.organizationId,
      storeId: params.storeId,
      writeOffId: params.writeOffId,
      idempotencyKey: idempotencyKey ?? '',
    });
  }

  @Post(':writeOffId/reverse')
  @RequirePermissions('write-offs:reverse')
  reverse(
    @Param() params: WriteOffParamsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.writeOffs.reverse({
      organizationId: params.organizationId,
      storeId: params.storeId,
      writeOffId: params.writeOffId,
      idempotencyKey: idempotencyKey ?? '',
    });
  }
}
