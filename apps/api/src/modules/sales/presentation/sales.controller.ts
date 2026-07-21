import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { hasPermission } from '@flower/permissions';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { CurrentAuthContext } from '../../auth/presentation/current-auth-context.decorator';
import type { AuthContext } from '../../../infrastructure/context/request-context';
import { SaleUseCases } from '../application/sale.use-cases';
import {
  AnnulSaleDto,
  CreateDirectSaleDto,
  CreateSaleFromOrderDto,
  ListSalesQueryDto,
  SaleParamsDto,
  StoreParamsDto,
} from './sale.dto';
import { presentConsumption, presentSale } from './sale.presenter';

@ApiTags('sales')
@RequirePermissions('sales:read')
@Controller('organizations/:organizationId/stores/:storeId')
export class SalesController {
  constructor(private readonly sales: SaleUseCases) {}

  @Post('orders/:orderId/sales')
  @RequirePermissions('sales:create')
  async createFromOrderPath(
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Body() body: CreateSaleFromOrderDto,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const sale = await this.sales.createSaleFromOrder({
      organizationId,
      storeId,
      orderId,
      salesChannel: body.salesChannel,
      unitPrice: body.unitPrice,
      comment: body.comment,
      discount: body.discount,
    });
    return presentSale(sale, this.viewOpts(auth));
  }

  @Post('sales/from-order')
  @RequirePermissions('sales:create')
  async createFromOrder(
    @Param() params: StoreParamsDto,
    @Body() body: CreateSaleFromOrderDto,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    if (!body.orderId) {
      throw new BadRequestException({ code: 'ORDER_ID_REQUIRED', message: 'orderId is required' });
    }
    const sale = await this.sales.createSaleFromOrder({
      ...params,
      orderId: body.orderId,
      salesChannel: body.salesChannel,
      unitPrice: body.unitPrice,
      comment: body.comment,
      discount: body.discount,
    });
    return presentSale(sale, this.viewOpts(auth));
  }

  @Post('sales/direct')
  @RequirePermissions('sales:create')
  async createDirect(
    @Param() params: StoreParamsDto,
    @Body() body: CreateDirectSaleDto,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const sale = await this.sales.createDirectSale({
      ...params,
      warehouseId: body.warehouseId,
      salesChannel: body.salesChannel,
      comment: body.comment,
      lines: body.lines,
      discount: body.discount,
    });
    return presentSale(sale, this.viewOpts(auth));
  }

  @Get('sales')
  async list(
    @Param() params: StoreParamsDto,
    @Query() query: ListSalesQueryDto,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const rows = await this.sales.listSales(params.organizationId, params.storeId, {
      status: query.status,
      type: query.type,
      orderId: query.orderId,
    });
    const opts = this.viewOpts(auth);
    return rows.map((row) => presentSale(row, opts));
  }

  @Get('sales/:saleId')
  async get(@Param() params: SaleParamsDto, @CurrentAuthContext() auth: AuthContext) {
    const sale = await this.sales.getSale(
      params.organizationId,
      params.storeId,
      params.saleId,
    );
    return presentSale(sale, this.viewOpts(auth));
  }

  @Post('sales/:saleId/complete')
  @RequirePermissions('sales:complete')
  async complete(
    @Param() params: SaleParamsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const sale = await this.sales.completeSale({
      organizationId: params.organizationId,
      storeId: params.storeId,
      saleId: params.saleId,
      idempotencyKey: idempotencyKey ?? '',
    });
    return presentSale(sale, this.viewOpts(auth));
  }

  @Post('sales/:saleId/annul')
  @RequirePermissions('sales:annul')
  async annul(
    @Param() params: SaleParamsDto,
    @Body() body: AnnulSaleDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const sale = await this.sales.annulSale({
      organizationId: params.organizationId,
      storeId: params.storeId,
      saleId: params.saleId,
      reason: body.reason,
      idempotencyKey: idempotencyKey ?? '',
    });
    return presentSale(sale, this.viewOpts(auth));
  }

  @Get('sales/:saleId/timeline')
  timeline(@Param() params: SaleParamsDto) {
    return this.sales.getTimeline(params.organizationId, params.storeId, params.saleId);
  }

  @Get('sales/:saleId/consumption')
  async consumption(
    @Param() params: SaleParamsDto,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    const row = await this.sales.getConsumption(
      params.organizationId,
      params.storeId,
      params.saleId,
    );
    if (!row) return null;
    const canViewCost = hasPermission(auth.permissions, ['sales:view-cost']);
    return presentConsumption(row, canViewCost);
  }

  private viewOpts(auth: AuthContext) {
    return {
      canViewCost: hasPermission(auth.permissions, ['sales:view-cost']),
      canViewMargin: hasPermission(auth.permissions, ['sales:view-margin']),
    };
  }
}
