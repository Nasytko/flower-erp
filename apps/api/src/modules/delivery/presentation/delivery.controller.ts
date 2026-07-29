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
import { hasPermission } from '@flower/permissions';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { DeliveryUseCases } from '../application/delivery.use-cases';
import {
  AddressSearchQueryDto,
  AssignCourierDto,
  BoardQueryDto,
  CancelDeliveryDto,
  CreateCourierDto,
  CreateDeliveryDto,
  DeliveryParamsDto,
  ExpectedVersionDto,
  ListCouriersQueryDto,
  ListDeliveriesQueryDto,
  OrderDeliveryParamsDto,
  PlanDeliveryDto,
  ProblemParamsDto,
  ReleaseCourierDto,
  ReportProblemDto,
  ResolveProblemDto,
  SetCoordinatesDto,
  StoreParamsDto,
  UpdateAddressDto,
  CourierParamsDto,
} from './delivery.dto';
import { presentCourier, presentDelivery } from './delivery.presenter';

@ApiTags('delivery')
@RequirePermissions('delivery:read')
@Controller('organizations/:organizationId/stores/:storeId')
export class DeliveryController {
  constructor(private readonly deliveries: DeliveryUseCases) {}

  @Post('orders/:orderId/delivery')
  @RequirePermissions('delivery:create')
  async createFromOrder(
    @Param() params: OrderDeliveryParamsDto,
    @Body() body: CreateDeliveryDto,
  ) {
    return presentDelivery(
      await this.deliveries.createDeliveryFromOrder({
        organizationId: params.organizationId,
        storeId: params.storeId,
        orderId: params.orderId,
        ...body,
      }),
    );
  }

  @Get('deliveries')
  async list(@Param() params: StoreParamsDto, @Query() query: ListDeliveriesQueryDto) {
    const rows = await this.deliveries.listDeliveries(
      params.organizationId,
      params.storeId,
      query,
    );
    return rows.map(presentDelivery);
  }

  @Get('addresses/search')
  @RequirePermissions('orders:read')
  searchAddresses(@Param() params: StoreParamsDto, @Query() query: AddressSearchQueryDto) {
    return this.deliveries.searchAddresses({
      organizationId: params.organizationId,
      storeId: params.storeId,
      query: query.q,
      city: query.city,
    });
  }

  @Get('deliveries/:deliveryId')
  async get(@Param() params: DeliveryParamsDto) {
    return presentDelivery(
      await this.deliveries.getDelivery(
        params.organizationId,
        params.storeId,
        params.deliveryId,
      ),
    );
  }

  @Post('deliveries/:deliveryId/plan')
  @RequirePermissions('delivery:update')
  async plan(@Param() params: DeliveryParamsDto, @Body() body: PlanDeliveryDto) {
    return presentDelivery(
      await this.deliveries.planDelivery({
        organizationId: params.organizationId,
        storeId: params.storeId,
        deliveryId: params.deliveryId,
        ...body,
      }),
    );
  }

  @Post('deliveries/:deliveryId/address')
  @RequirePermissions('delivery:update')
  async address(@Param() params: DeliveryParamsDto, @Body() body: UpdateAddressDto) {
    return presentDelivery(
      await this.deliveries.updateAddress({
        organizationId: params.organizationId,
        storeId: params.storeId,
        deliveryId: params.deliveryId,
        ...body,
      }),
    );
  }

  @Post('deliveries/:deliveryId/geocode')
  @RequirePermissions('delivery:update')
  async geocode(@Param() params: DeliveryParamsDto, @Body() body: ExpectedVersionDto) {
    return presentDelivery(
      await this.deliveries.geocodeDelivery({
        organizationId: params.organizationId,
        storeId: params.storeId,
        deliveryId: params.deliveryId,
        expectedVersion: body.expectedVersion,
      }),
    );
  }

  @Post('deliveries/:deliveryId/coordinates')
  @RequirePermissions('delivery:update')
  async coordinates(@Param() params: DeliveryParamsDto, @Body() body: SetCoordinatesDto) {
    return presentDelivery(
      await this.deliveries.setCoordinatesManual({
        organizationId: params.organizationId,
        storeId: params.storeId,
        deliveryId: params.deliveryId,
        ...body,
      }),
    );
  }

  @Post('deliveries/:deliveryId/assign')
  @RequirePermissions('delivery:assign')
  async assign(@Param() params: DeliveryParamsDto, @Body() body: AssignCourierDto) {
    return presentDelivery(
      await this.deliveries.assignCourier({
        organizationId: params.organizationId,
        storeId: params.storeId,
        deliveryId: params.deliveryId,
        ...body,
      }),
    );
  }

  @Post('deliveries/:deliveryId/reassign')
  @RequirePermissions('delivery:assign')
  async reassign(@Param() params: DeliveryParamsDto, @Body() body: AssignCourierDto) {
    return presentDelivery(
      await this.deliveries.reassignCourier({
        organizationId: params.organizationId,
        storeId: params.storeId,
        deliveryId: params.deliveryId,
        ...body,
      }),
    );
  }

  @Post('deliveries/:deliveryId/release-courier')
  @RequirePermissions('delivery:assign')
  async release(@Param() params: DeliveryParamsDto, @Body() body: ReleaseCourierDto) {
    return presentDelivery(
      await this.deliveries.releaseCourier({
        organizationId: params.organizationId,
        storeId: params.storeId,
        deliveryId: params.deliveryId,
        ...body,
      }),
    );
  }

  @Post('deliveries/:deliveryId/ready-for-dispatch')
  @RequirePermissions('delivery:dispatch')
  async ready(@Param() params: DeliveryParamsDto, @Body() body: ExpectedVersionDto) {
    return presentDelivery(
      await this.deliveries.markReadyForDispatch({
        organizationId: params.organizationId,
        storeId: params.storeId,
        deliveryId: params.deliveryId,
        expectedVersion: body.expectedVersion,
      }),
    );
  }

  @Post('deliveries/:deliveryId/handover')
  @RequirePermissions('delivery:dispatch')
  async handover(@Param() params: DeliveryParamsDto, @Body() body: ExpectedVersionDto) {
    return presentDelivery(
      await this.deliveries.handover({
        organizationId: params.organizationId,
        storeId: params.storeId,
        deliveryId: params.deliveryId,
        expectedVersion: body.expectedVersion,
      }),
    );
  }

  @Post('deliveries/:deliveryId/start-transit')
  @RequirePermissions('delivery:dispatch')
  async startTransit(@Param() params: DeliveryParamsDto, @Body() body: ExpectedVersionDto) {
    return presentDelivery(
      await this.deliveries.startTransit({
        organizationId: params.organizationId,
        storeId: params.storeId,
        deliveryId: params.deliveryId,
        expectedVersion: body.expectedVersion,
      }),
    );
  }

  @Post('deliveries/:deliveryId/deliver')
  @RequirePermissions('delivery:complete')
  async deliver(
    @Param() params: DeliveryParamsDto,
    @Body() body: ExpectedVersionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return presentDelivery(
      await this.deliveries.markDelivered({
        organizationId: params.organizationId,
        storeId: params.storeId,
        deliveryId: params.deliveryId,
        expectedVersion: body.expectedVersion,
        idempotencyKey,
      }),
    );
  }

  @Post('deliveries/:deliveryId/cancel')
  @RequirePermissions('delivery:cancel')
  async cancel(
    @Param() params: DeliveryParamsDto,
    @Body() body: CancelDeliveryDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return presentDelivery(
      await this.deliveries.cancelDelivery({
        organizationId: params.organizationId,
        storeId: params.storeId,
        deliveryId: params.deliveryId,
        expectedVersion: body.expectedVersion,
        reason: body.reason,
        idempotencyKey,
      }),
    );
  }

  @Get('deliveries/:deliveryId/summary')
  async summary(@Param() params: DeliveryParamsDto) {
    const permissions = getRequestContext()?.auth?.permissions ?? [];
    const includePayment = hasPermission(permissions, ['delivery:view-payment-summary']);
    return this.deliveries.getSummary(
      params.organizationId,
      params.storeId,
      params.deliveryId,
      includePayment,
    );
  }

  @Post('deliveries/:deliveryId/problems')
  @RequirePermissions('delivery:report-problem')
  async reportProblem(@Param() params: DeliveryParamsDto, @Body() body: ReportProblemDto) {
    const result = await this.deliveries.reportProblem({
      organizationId: params.organizationId,
      storeId: params.storeId,
      deliveryId: params.deliveryId,
      ...body,
    });
    return { delivery: presentDelivery(result.job), problem: result.problem };
  }

  @Post('deliveries/:deliveryId/problems/:problemId/resolve')
  @RequirePermissions('delivery:resolve-problem')
  async resolveProblem(
    @Param() params: ProblemParamsDto,
    @Body() body: ResolveProblemDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const result = await this.deliveries.resolveProblem({
      organizationId: params.organizationId,
      storeId: params.storeId,
      deliveryId: params.deliveryId,
      problemId: params.problemId,
      resolution: body.resolution,
      resolveToStatus: body.resolveToStatus,
      expectedVersion: body.expectedVersion,
      idempotencyKey,
    });
    return { delivery: presentDelivery(result.job), problem: result.problem };
  }

  @Get('couriers')
  async listCouriers(@Param() params: StoreParamsDto, @Query() query: ListCouriersQueryDto) {
    const rows = await this.deliveries.listCouriers(params.organizationId, query.status);
    return rows.map(presentCourier);
  }

  @Post('couriers')
  @RequirePermissions('delivery:manage-couriers')
  async createCourier(@Param() params: StoreParamsDto, @Body() body: CreateCourierDto) {
    return presentCourier(
      await this.deliveries.createCourier({
        organizationId: params.organizationId,
        ...body,
      }),
    );
  }

  @Post('couriers/:courierId/archive')
  @RequirePermissions('delivery:manage-couriers')
  async archiveCourier(@Param() params: CourierParamsDto) {
    return presentCourier(
      await this.deliveries.archiveCourier(params.organizationId, params.courierId),
    );
  }

  @Get('delivery-board')
  async board(@Param() params: StoreParamsDto, @Query() query: BoardQueryDto) {
    return this.deliveries.getBoard(params.organizationId, params.storeId, query.date);
  }

  @Get('delivery-map')
  async map(@Param() params: StoreParamsDto, @Query() query: BoardQueryDto) {
    return this.deliveries.getMap(params.organizationId, params.storeId, query.date);
  }

  @Get('delivery-calendar')
  async calendar(@Param() params: StoreParamsDto, @Query() query: BoardQueryDto) {
    return this.deliveries.getCalendar(params.organizationId, params.storeId, query.date);
  }
}
