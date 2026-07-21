import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { PaymentUseCases } from '../application/payment.use-cases';
import {
  AllocatePrepaymentsDto,
  AnnulReasonDto,
  CreatePaymentDto,
  CreatePaymentMethodDto,
  CreateRefundDto,
  CreateTargetPaymentDto,
  ListCashOperationsQueryDto,
  ListMethodsQueryDto,
  ListPaymentsQueryDto,
  MethodParamsDto,
  OrderParamsDto,
  PaymentParamsDto,
  RefundParamsDto,
  SaleParamsDto,
  StoreParamsDto,
} from './payment.dto';
import {
  presentCashAccount,
  presentCashOperation,
  presentMethod,
  presentPayment,
  presentRefund,
  presentSummary,
  presentTimeline,
} from './payment.presenter';

@ApiTags('payments')
@RequirePermissions('payments:read')
@Controller('organizations/:organizationId/stores/:storeId')
export class PaymentsController {
  constructor(private readonly payments: PaymentUseCases) {}

  @Post('payment-methods/ensure-defaults')
  @RequirePermissions('payments:manage-methods')
  async ensureDefaultMethods(@Param('organizationId') organizationId: string) {
    const rows = await this.payments.ensureDefaultPaymentMethods(organizationId);
    return rows.map(presentMethod);
  }

  @Get('payment-methods')
  async listMethods(
    @Param('organizationId') organizationId: string,
    @Query() query: ListMethodsQueryDto,
  ) {
    const rows = await this.payments.listPaymentMethods(
      organizationId,
      query.activeOnly ?? false,
    );
    return rows.map(presentMethod);
  }

  @Post('payment-methods')
  @RequirePermissions('payments:manage-methods')
  async createMethod(
    @Param('organizationId') organizationId: string,
    @Body() body: CreatePaymentMethodDto,
  ) {
    return presentMethod(
      await this.payments.createPaymentMethod({
        organizationId,
        code: body.code,
        name: body.name,
        type: body.type,
        requiresExternalConfirmation: body.requiresExternalConfirmation,
        sortOrder: body.sortOrder,
      }),
    );
  }

  @Post('payment-methods/:methodId/archive')
  @RequirePermissions('payments:manage-methods')
  async archiveMethod(@Param() params: MethodParamsDto) {
    return presentMethod(
      await this.payments.archivePaymentMethod(params.organizationId, params.methodId),
    );
  }

  @Get('payments')
  async list(@Param() params: StoreParamsDto, @Query() query: ListPaymentsQueryDto) {
    const rows = await this.payments.listPayments(params.organizationId, params.storeId, {
      status: query.status,
      type: query.type,
    });
    return rows.map(presentPayment);
  }

  @Post('payments')
  @RequirePermissions('payments:create')
  async create(@Param() params: StoreParamsDto, @Body() body: CreatePaymentDto) {
    return presentPayment(
      await this.payments.createPayment({
        ...params,
        type: body.type,
        methodId: body.methodId,
        amount: body.amount,
        currencyCode: body.currencyCode,
        receivedAt: body.receivedAt,
        comment: body.comment,
        externalReference: body.externalReference,
        allocations: body.allocations,
      }),
    );
  }

  @Get('payments/:paymentId')
  async get(@Param() params: PaymentParamsDto) {
    return presentPayment(
      await this.payments.getPayment(
        params.organizationId,
        params.storeId,
        params.paymentId,
      ),
    );
  }

  @Post('payments/:paymentId/complete')
  @RequirePermissions('payments:complete')
  async complete(
    @Param() params: PaymentParamsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return presentPayment(
      await this.payments.completePayment({
        organizationId: params.organizationId,
        storeId: params.storeId,
        paymentId: params.paymentId,
        idempotencyKey: idempotencyKey ?? '',
      }),
    );
  }

  @Post('payments/:paymentId/annul')
  @RequirePermissions('payments:annul')
  async annul(
    @Param() params: PaymentParamsDto,
    @Body() body: AnnulReasonDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return presentPayment(
      await this.payments.annulPayment({
        organizationId: params.organizationId,
        storeId: params.storeId,
        paymentId: params.paymentId,
        reason: body.reason,
        idempotencyKey: idempotencyKey ?? '',
      }),
    );
  }

  @Get('payments/:paymentId/timeline')
  async timeline(@Param() params: PaymentParamsDto) {
    return presentTimeline(
      await this.payments.getTimeline(
        params.organizationId,
        params.storeId,
        params.paymentId,
      ),
    );
  }

  @Get('payments/:paymentId/refunds')
  async listRefunds(@Param() params: PaymentParamsDto) {
    const rows = await this.payments.listRefunds(
      params.organizationId,
      params.storeId,
      params.paymentId,
    );
    return rows.map(presentRefund);
  }

  @Post('payments/:paymentId/refunds')
  @RequirePermissions('payments:refund')
  async createRefund(@Param() params: PaymentParamsDto, @Body() body: CreateRefundDto) {
    return presentRefund(
      await this.payments.createRefund({
        organizationId: params.organizationId,
        storeId: params.storeId,
        paymentId: params.paymentId,
        amount: body.amount,
        reason: body.reason,
        methodId: body.methodId,
        externalReference: body.externalReference,
      }),
    );
  }

  @Post('refunds/:refundId/complete')
  @RequirePermissions('payments:refund')
  async completeRefund(
    @Param() params: RefundParamsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return presentRefund(
      await this.payments.completeRefund({
        organizationId: params.organizationId,
        storeId: params.storeId,
        refundId: params.refundId,
        idempotencyKey: idempotencyKey ?? '',
      }),
    );
  }

  @Post('refunds/:refundId/annul')
  @RequirePermissions('payments:refund')
  async annulRefund(
    @Param() params: RefundParamsDto,
    @Body() body: AnnulReasonDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return presentRefund(
      await this.payments.annulRefund({
        organizationId: params.organizationId,
        storeId: params.storeId,
        refundId: params.refundId,
        reason: body.reason,
        idempotencyKey: idempotencyKey ?? '',
      }),
    );
  }

  @Post('orders/:orderId/payments')
  @RequirePermissions('payments:create')
  async createOrderPayment(
    @Param() params: OrderParamsDto,
    @Body() body: CreateTargetPaymentDto,
  ) {
    return presentPayment(
      await this.payments.createOrderPrepayment({
        organizationId: params.organizationId,
        storeId: params.storeId,
        orderId: params.orderId,
        methodId: body.methodId,
        amount: body.amount,
        comment: body.comment,
        externalReference: body.externalReference,
        receivedAt: body.receivedAt,
      }),
    );
  }

  @Get('orders/:orderId/payment-summary')
  async orderSummary(@Param() params: OrderParamsDto) {
    return presentSummary(
      await this.payments.getOrderPaymentSummary(
        params.organizationId,
        params.storeId,
        params.orderId,
      ),
    );
  }

  @Post('orders/:orderId/allocate-prepayments-to-sale')
  @RequirePermissions('payments:complete')
  async allocatePrepayments(
    @Param() params: OrderParamsDto,
    @Body() body: AllocatePrepaymentsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const rows = await this.payments.allocateOrderPrepaymentsToSale({
      organizationId: params.organizationId,
      storeId: params.storeId,
      orderId: params.orderId,
      saleId: body.saleId,
      idempotencyKey: idempotencyKey ?? '',
    });
    return rows.map(presentPayment);
  }

  @Post('sales/:saleId/payments')
  @RequirePermissions('payments:create')
  async createSalePayment(
    @Param() params: SaleParamsDto,
    @Body() body: CreateTargetPaymentDto,
  ) {
    return presentPayment(
      await this.payments.createSalePayment({
        organizationId: params.organizationId,
        storeId: params.storeId,
        saleId: params.saleId,
        methodId: body.methodId,
        amount: body.amount,
        comment: body.comment,
        externalReference: body.externalReference,
        receivedAt: body.receivedAt,
      }),
    );
  }

  @Get('sales/:saleId/payment-summary')
  async saleSummary(@Param() params: SaleParamsDto) {
    return presentSummary(
      await this.payments.getSalePaymentSummary(
        params.organizationId,
        params.storeId,
        params.saleId,
      ),
    );
  }

  @Post('cash-accounts/ensure-default')
  @RequirePermissions('payments:view-cash')
  async ensureCash(@Param() params: StoreParamsDto) {
    return presentCashAccount(
      await this.payments.ensureDefaultCashAccount(params.organizationId, params.storeId),
    );
  }

  @Get('cash-accounts')
  @RequirePermissions('payments:view-cash')
  async listCashAccounts(@Param() params: StoreParamsDto) {
    const rows = await this.payments.listCashAccounts(
      params.organizationId,
      params.storeId,
    );
    return rows.map(presentCashAccount);
  }

  @Get('cash-accounts/:cashAccountId/operations')
  @RequirePermissions('payments:view-cash')
  async listCashAccountOperations(
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Param('cashAccountId') cashAccountId: string,
  ) {
    const rows = await this.payments.listCashOperations(
      organizationId,
      storeId,
      cashAccountId,
    );
    return rows.map(presentCashOperation);
  }

  @Get('cash-operations')
  @RequirePermissions('payments:view-cash')
  async listCashOperations(
    @Param() params: StoreParamsDto,
    @Query() query: ListCashOperationsQueryDto,
  ) {
    const rows = await this.payments.listCashOperations(
      params.organizationId,
      params.storeId,
      query.cashAccountId,
    );
    return rows.map(presentCashOperation);
  }
}
