import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { GoodsReceiptUseCases, SupplyUseCases } from '../application/supply.use-cases';
import {
  CreateReceiptDto,
  CreateSupplyDto,
  ListSuppliesQueryDto,
  ReceiptItemDto,
  ReceiptParamsDto,
  StoreParamsDto,
  SupplyItemDto,
  SupplyParamsDto,
} from './supply.dto';

@ApiTags('supply')
@RequirePermissions('supply:read')
@Controller('organizations/:organizationId/stores/:storeId')
export class SupplyController {
  constructor(
    private readonly supplies: SupplyUseCases,
    private readonly receipts: GoodsReceiptUseCases,
  ) {}

  @Post('supplies')
  @RequirePermissions('supply:create')
  createSupply(@Param() params: StoreParamsDto, @Body() body: CreateSupplyDto) {
    return this.supplies.createSupply({ ...params, ...body });
  }

  @Get('supplies')
  listSupplies(@Param() params: StoreParamsDto, @Query() query: ListSuppliesQueryDto) {
    return this.supplies.listSupplies(params.organizationId, params.storeId, query.status);
  }

  @Get('supplies/:supplyId')
  getSupply(@Param() params: SupplyParamsDto) {
    return this.supplies.getSupply(params.organizationId, params.storeId, params.supplyId);
  }

  @Post('supplies/:supplyId/items')
  @RequirePermissions('supply:create')
  addSupplyItem(@Param() params: SupplyParamsDto, @Body() body: SupplyItemDto) {
    return this.supplies.addSupplyItem({ ...params, ...body });
  }

  @Post('supplies/:supplyId/items/:itemId/remove')
  @RequirePermissions('supply:create')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeSupplyItem(@Param() params: SupplyParamsDto & { itemId: string }) {
    await this.supplies.removeSupplyItem(params);
  }

  @Post('supplies/:supplyId/submit')
  @RequirePermissions('supply:submit')
  submit(@Param() params: SupplyParamsDto) {
    return this.supplies.submitSupply(params);
  }

  @Post('supplies/:supplyId/annul')
  @RequirePermissions('supply:create')
  annul(@Param() params: SupplyParamsDto) {
    return this.supplies.annulDraftSupply(params);
  }

  @Post('supplies/:supplyId/receipts')
  @RequirePermissions('supply:receive')
  createReceipt(@Param() params: SupplyParamsDto, @Body() body: CreateReceiptDto) {
    return this.receipts.createGoodsReceipt({ ...params, ...body });
  }

  @Get('supplies/:supplyId/receipts')
  listReceipts(@Param() params: SupplyParamsDto) {
    return this.receipts.listGoodsReceipts(
      params.organizationId,
      params.storeId,
      params.supplyId,
    );
  }

  @Get('goods-receipts/:goodsReceiptId')
  getReceipt(@Param() params: ReceiptParamsDto) {
    return this.receipts.getGoodsReceipt(
      params.organizationId,
      params.storeId,
      params.goodsReceiptId,
    );
  }

  @Post('goods-receipts/:goodsReceiptId/items')
  @RequirePermissions('supply:receive')
  addReceiptItem(@Param() params: ReceiptParamsDto, @Body() body: ReceiptItemDto) {
    return this.receipts.addGoodsReceiptItem({ ...params, ...body });
  }

  @Post('goods-receipts/:goodsReceiptId/post')
  @RequirePermissions('supply:receive')
  postReceipt(
    @Param() params: ReceiptParamsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.receipts.postGoodsReceipt({ ...params, idempotencyKey });
  }

  @Post('goods-receipts/:goodsReceiptId/reverse')
  @RequirePermissions('supply:reverse')
  reverseReceipt(
    @Param() params: ReceiptParamsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.receipts.reverseGoodsReceipt({ ...params, idempotencyKey });
  }
}
