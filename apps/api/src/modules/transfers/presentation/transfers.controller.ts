import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { TransferUseCases } from '../application/transfer.use-cases';

class StoreParamsDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  storeId!: string;
}

class TransferParamsDto extends StoreParamsDto {
  @IsUUID()
  transferId!: string;
}

class ExpectedVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

class CreateTransferDto {
  @IsUUID()
  fromWarehouseId!: string;

  @IsUUID()
  toWarehouseId!: string;

  @IsOptional()
  @IsString()
  comment?: string | null;
}

class AddTransferItemDto {
  @IsUUID()
  itemId!: string;

  @IsString()
  @MinLength(1)
  requestedQuantity!: string;
}

class DispatchLineDto {
  @IsUUID()
  transferItemId!: string;

  @IsString()
  @MinLength(1)
  dispatchQuantity!: string;
}

class DispatchTransferDto extends ExpectedVersionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispatchLineDto)
  items!: DispatchLineDto[];
}

class ReceiveAllocationDto {
  @IsUUID()
  transferAllocationId!: string;

  @IsUUID()
  transferItemId!: string;

  @IsUUID()
  itemId!: string;

  @IsString()
  @MinLength(1)
  receivedQuantity!: string;

  @IsString()
  @MinLength(1)
  damagedQuantity!: string;
}

class ReceiveTransferDto extends ExpectedVersionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveAllocationDto)
  allocations!: ReceiveAllocationDto[];
}

@ApiTags('transfers')
@RequirePermissions('transfers:read')
@Controller('organizations/:organizationId/stores/:storeId/transfers')
export class TransfersController {
  constructor(private readonly transfers: TransferUseCases) {}

  @Get()
  list(@Param() params: StoreParamsDto) {
    return this.transfers.list(params.organizationId, params.storeId);
  }

  @Get(':transferId')
  get(@Param() params: TransferParamsDto) {
    return this.transfers.get(params.organizationId, params.storeId, params.transferId);
  }

  @Get(':transferId/timeline')
  timeline(@Param() params: TransferParamsDto) {
    return this.transfers.timeline(params.organizationId, params.storeId, params.transferId);
  }

  @Post()
  @RequirePermissions('transfers:create')
  create(@Param() params: StoreParamsDto, @Body() body: CreateTransferDto) {
    return this.transfers.create({
      organizationId: params.organizationId,
      storeId: params.storeId,
      fromWarehouseId: body.fromWarehouseId,
      toWarehouseId: body.toWarehouseId,
      comment: body.comment,
    });
  }

  @Post(':transferId/items')
  @RequirePermissions('transfers:create')
  addItem(@Param() params: TransferParamsDto, @Body() body: AddTransferItemDto) {
    return this.transfers.addItem({
      organizationId: params.organizationId,
      storeId: params.storeId,
      transferId: params.transferId,
      itemId: body.itemId,
      requestedQuantity: body.requestedQuantity,
    });
  }

  @Post(':transferId/dispatch')
  @RequirePermissions('transfers:dispatch')
  dispatch(
    @Param() params: TransferParamsDto,
    @Body() body: DispatchTransferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.transfers.dispatch({
      organizationId: params.organizationId,
      storeId: params.storeId,
      transferId: params.transferId,
      expectedVersion: body.expectedVersion,
      idempotencyKey: idempotencyKey ?? '',
      items: body.items,
    });
  }

  @Post(':transferId/receive')
  @RequirePermissions('transfers:receive')
  receive(
    @Param() params: TransferParamsDto,
    @Body() body: ReceiveTransferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.transfers.receive({
      organizationId: params.organizationId,
      storeId: params.storeId,
      transferId: params.transferId,
      expectedVersion: body.expectedVersion,
      idempotencyKey: idempotencyKey ?? '',
      allocations: body.allocations,
    });
  }

  @Post(':transferId/cancel')
  @RequirePermissions('transfers:cancel')
  cancel(
    @Param() params: TransferParamsDto,
    @Body() body: ExpectedVersionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.transfers.cancel({
      organizationId: params.organizationId,
      storeId: params.storeId,
      transferId: params.transferId,
      expectedVersion: body.expectedVersion,
      idempotencyKey,
    });
  }

  @Post(':transferId/reverse')
  @RequirePermissions('transfers:cancel')
  reverse(
    @Param() params: TransferParamsDto,
    @Body() body: ExpectedVersionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.transfers.reverse({
      organizationId: params.organizationId,
      storeId: params.storeId,
      transferId: params.transferId,
      expectedVersion: body.expectedVersion,
      idempotencyKey: idempotencyKey ?? '',
    });
  }
}
