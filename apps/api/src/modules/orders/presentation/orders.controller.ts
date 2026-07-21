import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { OrderUseCases } from '../application/order.use-cases';
import { OrderOccasion, OrderStatus, OrderType } from '../domain/order-rules';
import {
  AddCommentDto,
  AssignFloristDto,
  CompositionItemDto,
  CreateOrderDto,
  ListOrdersQueryDto,
  OrderParamsDto,
  ReassignFloristDto,
  ReleaseAssignmentDto,
  ReplaceCompositionItemDto,
  SetActualCompositionDto,
  SetCompositionDto,
  StoreParamsDto,
  UpdateOrderDto,
} from './order.dto';

@ApiTags('orders')
@RequirePermissions('orders:read')
@Controller('organizations/:organizationId/stores/:storeId')
export class OrdersController {
  constructor(private readonly orders: OrderUseCases) {}

  @Get('orders/dashboard')
  dashboard(@Param() params: StoreParamsDto) {
    return this.orders.getDashboard(params.organizationId, params.storeId);
  }

  @Post('orders')
  @RequirePermissions('orders:create')
  create(@Param() params: StoreParamsDto, @Body() body: CreateOrderDto) {
    return this.orders.createOrder({
      ...params,
      ...body,
      type: body.type as OrderType | undefined,
      occasion: body.occasion as OrderOccasion | undefined,
    });
  }

  @Get('orders')
  list(@Param() params: StoreParamsDto, @Query() query: ListOrdersQueryDto) {
    return this.orders.listOrders(
      params.organizationId,
      params.storeId,
      query.status as OrderStatus | undefined,
    );
  }

  @Post('orders/claim-next')
  @RequirePermissions('orders:assign', 'orders:prepare')
  claimNext(@Param() params: StoreParamsDto) {
    return this.orders.claimNextOrder(params);
  }

  @Get('orders/:orderId')
  get(@Param() params: OrderParamsDto) {
    return this.orders.getOrder(params.organizationId, params.storeId, params.orderId);
  }

  @Post('orders/:orderId/update')
  @RequirePermissions('orders:update')
  update(@Param() params: OrderParamsDto, @Body() body: UpdateOrderDto) {
    return this.orders.updateDraft({
      ...params,
      ...body,
      type: body.type as OrderType | undefined,
      occasion: body.occasion as OrderOccasion | undefined,
    });
  }

  @Post('orders/:orderId/composition')
  @RequirePermissions('orders:update')
  setComposition(@Param() params: OrderParamsDto, @Body() body: SetCompositionDto) {
    return this.orders.setPlannedComposition({
      ...params,
      items: body.items.map((i) => ({
        itemId: i.itemId,
        quantity: i.plannedQuantity,
        comment: i.comment,
      })),
    });
  }

  @Post('orders/:orderId/composition/items')
  @RequirePermissions('orders:update')
  addCompositionItem(@Param() params: OrderParamsDto, @Body() body: CompositionItemDto) {
    return this.orders.addCompositionItem({
      ...params,
      itemId: body.itemId,
      quantity: body.plannedQuantity,
      comment: body.comment,
    });
  }

  @Post('orders/:orderId/composition/replacements')
  @RequirePermissions('orders:prepare')
  replaceCompositionItem(
    @Param() params: OrderParamsDto,
    @Body() body: ReplaceCompositionItemDto,
  ) {
    return this.orders.replaceCompositionItem({
      ...params,
      expectedVersion: body.expectedVersion,
      fromItemId: body.fromItemId,
      toItemId: body.toItemId,
      quantity: body.quantity,
      reason: body.reason,
      comment: body.comment,
    });
  }

  @Post('orders/:orderId/confirm')
  @RequirePermissions('orders:confirm')
  confirm(@Param() params: OrderParamsDto) {
    return this.orders.confirmOrder(params);
  }

  @Post('orders/:orderId/reserve')
  @RequirePermissions('orders:reserve')
  reserve(@Param() params: OrderParamsDto) {
    return this.orders.reserveOrder(params);
  }

  @Post('orders/:orderId/assign')
  @RequirePermissions('orders:assign')
  assign(@Param() params: OrderParamsDto, @Body() body: AssignFloristDto) {
    return this.orders.assignFlorist({ ...params, membershipId: body.membershipId });
  }

  @Post('orders/:orderId/claim')
  @RequirePermissions('orders:assign')
  claim(@Param() params: OrderParamsDto) {
    return this.orders.claimOrder(params);
  }

  @Post('orders/:orderId/reassign')
  @RequirePermissions('orders:assign')
  reassign(@Param() params: OrderParamsDto, @Body() body: ReassignFloristDto) {
    return this.orders.reassignOrder({
      ...params,
      membershipId: body.membershipId,
      reason: body.reason,
    });
  }

  @Post('orders/:orderId/assignment/release')
  @RequirePermissions('orders:assign')
  @HttpCode(HttpStatus.OK)
  releaseAssignment(@Param() params: OrderParamsDto, @Body() body: ReleaseAssignmentDto) {
    return this.orders.releaseAssignment({ ...params, reason: body.reason });
  }

  @Post('orders/:orderId/start-preparation')
  @RequirePermissions('orders:prepare')
  startPreparation(@Param() params: OrderParamsDto) {
    return this.orders.startPreparation(params);
  }

  @Post('orders/:orderId/actual-composition')
  @RequirePermissions('orders:prepare')
  setActual(@Param() params: OrderParamsDto, @Body() body: SetActualCompositionDto) {
    return this.orders.updateActualComposition({
      ...params,
      expectedVersion: body.expectedVersion,
      items: body.items.map((i) => ({
        itemId: i.itemId,
        quantity: i.actualQuantity,
        batchId: i.batchId,
        comment: i.comment,
      })),
    });
  }

  @Post('orders/:orderId/mark-ready')
  @RequirePermissions('orders:prepare')
  markReady(@Param() params: OrderParamsDto) {
    return this.orders.markReady(params);
  }

  @Post('orders/:orderId/complete')
  @RequirePermissions('orders:prepare')
  complete(@Param() params: OrderParamsDto) {
    return this.orders.completeOrder(params);
  }

  @Post('orders/:orderId/cancel')
  @RequirePermissions('orders:cancel')
  cancel(@Param() params: OrderParamsDto) {
    return this.orders.cancelOrder(params);
  }

  @Post('orders/:orderId/comments')
  @RequirePermissions('orders:update')
  addComment(@Param() params: OrderParamsDto, @Body() body: AddCommentDto) {
    return this.orders.addComment({ ...params, message: body.message });
  }

  @Get('orders/:orderId/timeline')
  timeline(@Param() params: OrderParamsDto) {
    return this.orders.getOrder(params.organizationId, params.storeId, params.orderId).then(
      (o) => o.timeline ?? [],
    );
  }
}
