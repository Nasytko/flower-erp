import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CLOCK_PORT, Money, type ClockPort } from '@flower/shared-kernel';
import type { ApiEnv } from '@flower/config';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { API_ENV } from '../../../infrastructure/infrastructure.module';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import {
  AddressSource,
  CourierStatus,
  DeliveryMethod,
  DeliveryProblemType,
  DeliveryStatus,
  DomainError,
  GeocodingStatus,
  assertCanAssign,
  assertCanCancel,
  assertCanDeliver,
  assertCanHandover,
  assertCanMarkReadyForDispatch,
  assertCanPlan,
  assertCanReportProblem,
  assertCanResolveProblem,
  assertCanStartTransit,
  assertDeliveryFeeNonNegative,
  assertFulfillmentSwitchToPickupAllowed,
  assertTimeWindowValid,
  buildDisplayAddress,
  computeDeliveryUrgency,
  computeRequiredDispatchAt,
  statusAfterAssign,
  statusAfterReadyForDispatch,
} from '../domain/delivery-rules';
import {
  DELIVERY_REPOSITORY,
  type DeliveryJobView,
  type DeliveryRepository,
} from './ports/delivery.repository';
import {
  ORDERS_DELIVERY_PORT,
  type OrdersDeliveryPort,
} from './ports/orders-delivery.port';
import {
  PAYMENTS_DELIVERY_READ_PORT,
  type PaymentsDeliveryReadPort,
} from '../../payments/application/ports/payments-delivery-read.port';
import {
  INTEGRATION_SETTINGS_REPOSITORY,
  type IntegrationSettingsRepository,
} from '../../organization/application/ports/integration-settings.repository';
import { GeocodingResolver, resolveIntegrationSettings } from '../infrastructure/geocoding-resolver';
import {
  buildAddressMapsUrl,
  buildNavigationLinks,
  type NavigationProvider,
} from '../infrastructure/navigation-links';
import type { DeliveryFulfillmentPort } from '../../orders/application/ports/delivery-fulfillment.port';
import type { DeliveryReadinessPort } from '../../orders/application/ports/delivery-readiness.port';

function mapDomain(error: unknown): never {
  const coded =
    error instanceof DomainError
      ? error
      : error instanceof Error &&
          'code' in error &&
          typeof (error as { code: unknown }).code === 'string'
        ? (error as Error & { code: string })
        : null;
  if (coded) {
    if (
      coded.code.includes('NOT_') ||
      coded.code.includes('INVALID') ||
      coded.code.includes('REQUIRED') ||
      coded.code.includes('FORBIDDEN') ||
      coded.code.includes('DOES_NOT')
    ) {
      throw new BadRequestException({ code: coded.code, message: coded.message });
    }
    throw new ConflictException({ code: coded.code, message: coded.message });
  }
  throw error;
}

function actorMembershipId(): string | null {
  return getRequestContext()?.auth?.membershipId ?? null;
}

function requireIdempotencyKey(key: string | undefined): string {
  const trimmed = key?.trim() ?? '';
  if (!trimmed) {
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Idempotency-Key header is required',
    });
  }
  return trimmed;
}

@Injectable()
export class DeliveryUseCases implements DeliveryReadinessPort, DeliveryFulfillmentPort {
  private readonly bufferMinutes: number;
  private readonly soonMinutes: number;

  constructor(
    @Inject(DELIVERY_REPOSITORY) private readonly deliveries: DeliveryRepository,
    @Inject(ORDERS_DELIVERY_PORT) private readonly orders: OrdersDeliveryPort,
    @Optional()
    @Inject(PAYMENTS_DELIVERY_READ_PORT)
    private readonly payments: PaymentsDeliveryReadPort | null,
    @Inject(INTEGRATION_SETTINGS_REPOSITORY)
    private readonly integrationSettings: IntegrationSettingsRepository,
    private readonly geocodingResolver: GeocodingResolver,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly organizations: OrganizationUseCases,
  ) {
    this.bufferMinutes = this.env.DELIVERY_DISPATCH_BUFFER_MINUTES;
    this.soonMinutes = this.env.DELIVERY_READY_SOON_MINUTES;
  }

  private async requireJob(organizationId: string, storeId: string, deliveryId: string) {
    const job = await this.deliveries.getJob(organizationId, storeId, deliveryId);
    if (!job) {
      throw new NotFoundException({ code: 'DELIVERY_NOT_FOUND', message: 'Delivery not found' });
    }
    return job;
  }

  private async claimIdempotency(
    organizationId: string,
    scope: string,
    key: string,
    documentId: string,
  ): Promise<boolean> {
    const existing = await this.deliveries.findIdempotency(organizationId, scope, key);
    if (existing) {
      if (existing.documentId !== documentId) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'Idempotency key already used for another document',
        });
      }
      return true;
    }
    await this.deliveries.createIdempotency({
      id: randomUUID(),
      organizationId,
      scope,
      key,
      documentId,
    });
    return false;
  }



  private async bump(
    job: DeliveryJobView,
    data: Parameters<DeliveryRepository['updateJob']>[3],
    expectedVersion?: number,
  ): Promise<DeliveryJobView> {
    const updated = await this.deliveries.updateJob(
      job.organizationId,
      job.storeId,
      job.id,
      data,
      expectedVersion ?? job.version,
    );
    if (!updated) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Delivery version conflict',
      });
    }
    return updated;
  }

  async createDeliveryFromOrder(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    method: DeliveryMethod;
    deliveryDate: string;
    windowStart: string;
    windowEnd: string;
    requiredDispatchAt?: string | null;
    recipientName?: string | null;
    recipientPhone?: string | null;
    addressLine: string;
    city?: string | null;
    postalCode?: string | null;
    entrance?: string | null;
    floor?: string | null;
    apartment?: string | null;
    accessCode?: string | null;
    deliveryComment?: string | null;
    deliveryFee?: string;
    externalReference?: string | null;
    providerName?: string | null;
  }) {
    const store = await this.organizations.getStore(input.organizationId, input.storeId);
    const order = await this.orders.getOrderForDelivery(
      input.organizationId,
      input.storeId,
      input.orderId,
    );
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }
    if (order.type !== 'DELIVERY') {
      throw new BadRequestException({
        code: 'ORDER_NOT_DELIVERY',
        message: 'Order fulfillment type must be DELIVERY',
      });
    }
    const existing = await this.deliveries.findActiveByOrderId(
      input.organizationId,
      input.orderId,
    );
    if (existing) {
      throw new ConflictException({
        code: 'ACTIVE_DELIVERY_EXISTS',
        message: 'Order already has an active delivery',
      });
    }

    const addressLine = input.addressLine.trim();
    if (!addressLine) {
      throw new BadRequestException({
        code: 'ADDRESS_REQUIRED',
        message: 'Delivery address is required',
      });
    }
    const city = resolveDeliveryCity(input.city, store);

    const windowStart = new Date(input.windowStart);
    const windowEnd = new Date(input.windowEnd);
    try {
      assertTimeWindowValid(windowStart, windowEnd);
      assertDeliveryFeeNonNegative(input.deliveryFee ?? '0');
    } catch (e) {
      mapDomain(e);
    }

    const fee = new Money(input.deliveryFee ?? '0').toFixed(2);
    const requiredDispatchAt = input.requiredDispatchAt
      ? new Date(input.requiredDispatchAt)
      : computeRequiredDispatchAt(windowStart, this.bufferMinutes);
    const displayAddress = buildDisplayAddress({
      addressLine,
      city,
      postalCode: input.postalCode,
      entrance: input.entrance,
      floor: input.floor,
      apartment: input.apartment,
    });

    return this.uow.runInTransaction(async () => {
      const job = await this.deliveries.createJob({
        id: randomUUID(),
        organizationId: input.organizationId,
        storeId: input.storeId,
        orderId: input.orderId,
        number: await this.deliveries.nextDeliveryNumber(input.organizationId),
        status: DeliveryStatus.DRAFT,
        method: input.method,
        deliveryDate: new Date(input.deliveryDate),
        windowStart,
        windowEnd,
        requiredDispatchAt,
        recipientName: input.recipientName ?? order.recipientName ?? 'Recipient',
        recipientPhone: input.recipientPhone ?? order.recipientPhone ?? '',
        displayAddress,
        addressLine,
        city,
        postalCode: input.postalCode ?? null,
        entrance: input.entrance ?? null,
        floor: input.floor ?? null,
        apartment: input.apartment ?? null,
        accessCode: input.accessCode ?? null,
        deliveryComment: input.deliveryComment ?? order.comment,
        geocodingStatus: GeocodingStatus.NOT_REQUESTED,
        deliveryFee: fee,
        currencyCode: 'BYN',
        externalReference: input.externalReference ?? null,
        providerName: input.providerName ?? null,
        createdByMembershipId: actorMembershipId(),
      });
      
      
      await this.audit.append({
        organizationId: input.organizationId,
        storeId: input.storeId,
        actorId: getRequestContext()?.actorId ?? null,
        action: 'DELIVERY_CREATED',
        entityType: 'DeliveryJob',
        entityId: job.id,
        beforeState: null,
        afterState: job as unknown as Record<string, unknown>,
        requestId: getRequestContext()?.requestId ?? 'unknown',
        occurredAt: this.clock.now(),
      });
      return job;
    });
  }

  async planDelivery(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    deliveryDate?: string;
    windowStart?: string;
    windowEnd?: string;
    requiredDispatchAt?: string | null;
    method?: DeliveryMethod;
    deliveryFee?: string;
    externalReference?: string | null;
    providerName?: string | null;
    expectedVersion: number;
  }) {
    return this.uow.runInTransaction(async () => {
      const job = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      try {
        assertCanPlan(job.status as DeliveryStatus);
      } catch (e) {
        mapDomain(e);
      }
      const windowStart = input.windowStart ? new Date(input.windowStart) : job.windowStart;
      const windowEnd = input.windowEnd ? new Date(input.windowEnd) : job.windowEnd;
      try {
        assertTimeWindowValid(windowStart, windowEnd);
        if (input.deliveryFee !== undefined) assertDeliveryFeeNonNegative(input.deliveryFee);
      } catch (e) {
        mapDomain(e);
      }
      const requiredDispatchAt =
        input.requiredDispatchAt === undefined
          ? computeRequiredDispatchAt(windowStart, this.bufferMinutes)
          : input.requiredDispatchAt
            ? new Date(input.requiredDispatchAt)
            : null;

      const updated = await this.bump(
        job,
        {
          status: DeliveryStatus.PLANNED,
          deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : undefined,
          windowStart,
          windowEnd,
          requiredDispatchAt,
          method: input.method,
          deliveryFee:
            input.deliveryFee !== undefined
              ? new Money(input.deliveryFee).toFixed(2)
              : undefined,
          externalReference: input.externalReference,
          providerName: input.providerName,
        },
        input.expectedVersion,
      );
      
      return updated;
    });
  }

  async updateAddress(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    addressLine: string;
    city?: string | null;
    postalCode?: string | null;
    entrance?: string | null;
    floor?: string | null;
    apartment?: string | null;
    accessCode?: string | null;
    deliveryComment?: string | null;
    recipientName?: string;
    recipientPhone?: string;
    expectedVersion: number;
  }) {
    return this.uow.runInTransaction(async () => {
      const job = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      if (
        job.status === DeliveryStatus.DELIVERED ||
        job.status === DeliveryStatus.CANCELLED
      ) {
        throw new BadRequestException({
          code: 'INVALID_STATUS_TRANSITION',
          message: 'Cannot update address on terminal delivery',
        });
      }
      const store = await this.organizations.getStore(input.organizationId, input.storeId);
      const city = resolveDeliveryCity(input.city, store);
      const displayAddress = buildDisplayAddress({
        addressLine: input.addressLine,
        city,
        postalCode: input.postalCode,
        entrance: input.entrance,
        floor: input.floor,
        apartment: input.apartment,
      });
      const updated = await this.bump(
        job,
        {
          addressLine: input.addressLine,
          city,
          postalCode: input.postalCode ?? null,
          entrance: input.entrance ?? null,
          floor: input.floor ?? null,
          apartment: input.apartment ?? null,
          accessCode: input.accessCode ?? null,
          deliveryComment: input.deliveryComment ?? null,
          displayAddress,
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          geocodingStatus: GeocodingStatus.NOT_REQUESTED,
          latitude: null,
          longitude: null,
          addressSource: AddressSource.MANUAL,
        },
        input.expectedVersion,
      );
      
      return updated;
    });
  }

  async geocodeDelivery(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    expectedVersion: number;
  }) {
    return this.uow.runInTransaction(async () => {
      const job = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      await this.bump(job, { geocodingStatus: GeocodingStatus.PENDING }, input.expectedVersion);
      const geocoding = await this.geocodingResolver.forOrganization(input.organizationId);
      const result = await geocoding.geocodeAddress({
        addressLine: job.addressLine,
        city: job.city,
        postalCode: job.postalCode,
      });
      const fresh = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      if (!result) {
        const failed = await this.bump(fresh, { geocodingStatus: GeocodingStatus.FAILED });
        return failed;
      }
      const updated = await this.bump(fresh, {
        latitude: result.latitude,
        longitude: result.longitude,
        displayAddress: result.displayAddress || job.displayAddress,
        geocodingStatus: GeocodingStatus.RESOLVED,
        addressSource: AddressSource.GEOCODED,
      });
      
      return updated;
    });
  }

  async setCoordinatesManual(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    latitude: string;
    longitude: string;
    expectedVersion: number;
  }) {
    return this.uow.runInTransaction(async () => {
      const job = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      const updated = await this.bump(
        job,
        {
          latitude: input.latitude,
          longitude: input.longitude,
          geocodingStatus: GeocodingStatus.MANUAL,
          addressSource: AddressSource.USER_PIN,
        },
        input.expectedVersion,
      );
      
      return updated;
    });
  }

  async assignCourier(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    courierProfileId: string;
    expectedVersion: number;
  }) {
    return this.uow.runInTransaction(async () => {
      const job = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      const courier = await this.deliveries.getCourier(
        input.organizationId,
        input.courierProfileId,
      );
      if (!courier) {
        throw new NotFoundException({ code: 'COURIER_NOT_FOUND', message: 'Courier not found' });
      }
      try {
        assertCanAssign({
          status: job.status as DeliveryStatus,
          courierStatus: courier.status as CourierStatus,
          courierOrganizationId: courier.organizationId,
          deliveryOrganizationId: job.organizationId,
        });
      } catch (e) {
        mapDomain(e);
      }
      await this.deliveries.releaseActiveAssignment(
        input.organizationId,
        job.id,
        this.clock.now(),
        'reassigned',
      );
      await this.deliveries.createAssignment({
        id: randomUUID(),
        organizationId: input.organizationId,
        deliveryJobId: job.id,
        courierProfileId: courier.id,
        assignedByMembershipId: actorMembershipId(),
        assignedAt: this.clock.now(),
      });
      const nextStatus = statusAfterAssign(job.status as DeliveryStatus);
      const updated = await this.bump(
        job,
        { assignedCourierId: courier.id, status: nextStatus },
        input.expectedVersion,
      );
      
      return updated;
    });
  }

  async reassignCourier(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    courierProfileId: string;
    expectedVersion: number;
  }) {
    const result = await this.assignCourier(input);
    
    return result;
  }

  async releaseCourier(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    reason?: string | null;
    expectedVersion: number;
  }) {
    return this.uow.runInTransaction(async () => {
      const job = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      await this.deliveries.releaseActiveAssignment(
        input.organizationId,
        job.id,
        this.clock.now(),
        input.reason ?? null,
      );
      const updated = await this.bump(
        job,
        {
          assignedCourierId: null,
          status:
            job.status === DeliveryStatus.ASSIGNED
              ? DeliveryStatus.PLANNED
              : (job.status as DeliveryStatus),
        },
        input.expectedVersion,
      );
      
      return updated;
    });
  }

  async markReadyForDispatch(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    expectedVersion: number;
  }) {
    return this.uow.runInTransaction(async () => {
      const job = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      const order = await this.orders.getOrderForDelivery(
        input.organizationId,
        input.storeId,
        job.orderId,
      );
      if (!order) {
        throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
      }
      try {
        assertCanMarkReadyForDispatch(
          job.status as DeliveryStatus,
          this.orders.isOrderReady(order),
        );
      } catch (e) {
        mapDomain(e);
      }
      const updated = await this.bump(
        job,
        { status: statusAfterReadyForDispatch(job.status as DeliveryStatus) },
        input.expectedVersion,
      );
      
      return updated;
    });
  }

  async handover(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    expectedVersion: number;
  }) {
    return this.uow.runInTransaction(async () => {
      const job = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      const order = await this.orders.getOrderForDelivery(
        input.organizationId,
        input.storeId,
        job.orderId,
      );
      if (!order) {
        throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
      }
      try {
        assertCanHandover(job.status as DeliveryStatus, this.orders.isOrderReady(order));
      } catch (e) {
        mapDomain(e);
      }
      const updated = await this.bump(
        job,
        { handedOverAt: this.clock.now() },
        input.expectedVersion,
      );
      
      return updated;
    });
  }

  async startTransit(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    expectedVersion: number;
  }) {
    return this.uow.runInTransaction(async () => {
      const job = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      const assignment = await this.deliveries.getActiveAssignment(
        input.organizationId,
        job.id,
      );
      try {
        assertCanStartTransit({
          status: job.status as DeliveryStatus,
          method: job.method as DeliveryMethod,
          hasActiveAssignment: Boolean(assignment),
          hasExternalReference: Boolean(job.externalReference),
        });
      } catch (e) {
        mapDomain(e);
      }
      const updated = await this.bump(
        job,
        {
          status: DeliveryStatus.IN_TRANSIT,
          departedAt: this.clock.now(),
          handedOverAt: job.handedOverAt ?? this.clock.now(),
        },
        input.expectedVersion,
      );
      
      return updated;
    });
  }

  async markDelivered(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    idempotencyKey: string | undefined;
    expectedVersion: number;
  }) {
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.uow.runInTransaction(async () => {
      const job = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      const replay = await this.claimIdempotency(
        input.organizationId,
        'delivery-deliver',
        key,
        job.id,
      );
      if (replay && job.status === DeliveryStatus.DELIVERED) return job;
      try {
        assertCanDeliver(job.status as DeliveryStatus);
      } catch (e) {
        mapDomain(e);
      }
      const updated = await this.bump(
        job,
        { status: DeliveryStatus.DELIVERED, deliveredAt: this.clock.now() },
        input.expectedVersion,
      );
      
      
      return updated;
    });
  }

  async cancelDelivery(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    idempotencyKey: string | undefined;
    reason?: string | null;
    expectedVersion: number;
  }) {
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.uow.runInTransaction(async () => {
      const job = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      const replay = await this.claimIdempotency(
        input.organizationId,
        'delivery-cancel',
        key,
        job.id,
      );
      if (replay && job.status === DeliveryStatus.CANCELLED) return job;
      try {
        assertCanCancel(job.status as DeliveryStatus);
      } catch (e) {
        mapDomain(e);
      }
      await this.deliveries.releaseActiveAssignment(
        input.organizationId,
        job.id,
        this.clock.now(),
        input.reason ?? 'cancelled',
      );
      const updated = await this.bump(
        job,
        {
          status: DeliveryStatus.CANCELLED,
          cancelledAt: this.clock.now(),
          assignedCourierId: null,
        },
        input.expectedVersion,
      );
      
      
      return updated;
    });
  }

  async reportProblem(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    type: DeliveryProblemType;
    description: string;
    expectedVersion: number;
  }) {
    return this.uow.runInTransaction(async () => {
      const job = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      try {
        assertCanReportProblem(job.status as DeliveryStatus);
      } catch (e) {
        mapDomain(e);
      }
      const problem = await this.deliveries.createProblem({
        id: randomUUID(),
        organizationId: input.organizationId,
        deliveryJobId: job.id,
        type: input.type,
        description: input.description,
        reportedByMembershipId: actorMembershipId(),
        reportedAt: this.clock.now(),
      });
      const updated = await this.bump(
        job,
        { status: DeliveryStatus.PROBLEM },
        input.expectedVersion,
      );
      
      return { job: updated, problem };
    });
  }

  async resolveProblem(input: {
    organizationId: string;
    storeId: string;
    deliveryId: string;
    problemId: string;
    resolution: string;
    resolveToStatus: DeliveryStatus;
    idempotencyKey: string | undefined;
    expectedVersion: number;
  }) {
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.uow.runInTransaction(async () => {
      const job = await this.requireJob(input.organizationId, input.storeId, input.deliveryId);
      const replay = await this.claimIdempotency(
        input.organizationId,
        'delivery-resolve-problem',
        key,
        input.problemId,
      );
      const problem = await this.deliveries.getProblem(
        input.organizationId,
        job.id,
        input.problemId,
      );
      if (!problem) {
        throw new NotFoundException({ code: 'PROBLEM_NOT_FOUND', message: 'Problem not found' });
      }
      if (replay && problem.status === 'RESOLVED') {
        return { job, problem };
      }
      try {
        assertCanResolveProblem(input.resolveToStatus);
      } catch (e) {
        mapDomain(e);
      }
      const resolved = await this.deliveries.resolveProblem({
        organizationId: input.organizationId,
        problemId: input.problemId,
        resolution: input.resolution,
        resolveToStatus: input.resolveToStatus,
        resolvedByMembershipId: actorMembershipId(),
        resolvedAt: this.clock.now(),
      });
      const updated = await this.bump(
        job,
        {
          status: input.resolveToStatus,
          deliveredAt:
            input.resolveToStatus === DeliveryStatus.DELIVERED
              ? this.clock.now()
              : job.deliveredAt,
          cancelledAt:
            input.resolveToStatus === DeliveryStatus.CANCELLED
              ? this.clock.now()
              : job.cancelledAt,
        },
        input.expectedVersion,
      );
      
      return { job: updated, problem: resolved };
    });
  }

  async createCourier(input: {
    organizationId: string;
    membershipId: string;
    displayNameSnapshot: string;
    phoneSnapshot?: string | null;
    vehicleType?: string | null;
    vehicleDescription?: string | null;
  }) {
    await this.organizations.getOrganization(input.organizationId);
    return this.deliveries.createCourier({
      id: randomUUID(),
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      displayNameSnapshot: input.displayNameSnapshot,
      phoneSnapshot: input.phoneSnapshot ?? null,
      vehicleType: input.vehicleType ?? null,
      vehicleDescription: input.vehicleDescription ?? null,
    });
  }

  async listCouriers(organizationId: string, status?: CourierStatus) {
    await this.organizations.getOrganization(organizationId);
    return this.deliveries.listCouriers(organizationId, status);
  }

  async archiveCourier(organizationId: string, courierId: string) {
    const updated = await this.deliveries.updateCourierStatus(
      organizationId,
      courierId,
      CourierStatus.ARCHIVED,
    );
    if (!updated) {
      throw new NotFoundException({ code: 'COURIER_NOT_FOUND', message: 'Courier not found' });
    }
    return updated;
  }

  /** Courier in delivery = user with COURIER role; profile is synced automatically. */
  async syncCourierMembership(input: {
    organizationId: string;
    membershipId: string;
    displayName: string;
    phoneSnapshot?: string | null;
    isCourier: boolean;
  }) {
    await this.organizations.getOrganization(input.organizationId);
    const existing = await this.deliveries.findCourierByMembershipId(
      input.organizationId,
      input.membershipId,
    );

    if (input.isCourier) {
      if (existing) {
        if (existing.status === CourierStatus.ARCHIVED) {
          await this.deliveries.updateCourierStatus(
            input.organizationId,
            existing.id,
            CourierStatus.ACTIVE,
          );
        }
        return existing;
      }
      return this.createCourier({
        organizationId: input.organizationId,
        membershipId: input.membershipId,
        displayNameSnapshot: input.displayName,
        phoneSnapshot: input.phoneSnapshot ?? null,
      });
    }

    if (existing && existing.status !== CourierStatus.ARCHIVED) {
      await this.archiveCourier(input.organizationId, existing.id);
    }
    return null;
  }

  async getDelivery(
    organizationId: string,
    storeId: string,
    deliveryId: string,
  ): Promise<DeliveryJobView> {
    return this.requireJob(organizationId, storeId, deliveryId);
  }

  async listDeliveries(
    organizationId: string,
    storeId: string,
    filter?: {
      status?: DeliveryStatus;
      deliveryDate?: string;
      courierId?: string;
    },
  ) {
    await this.organizations.getStore(organizationId, storeId);
    return this.deliveries.listJobs(organizationId, storeId, {
      status: filter?.status,
      deliveryDate: filter?.deliveryDate ? new Date(filter.deliveryDate) : undefined,
      courierId: filter?.courierId,
    });
  }

  async getSummary(
    organizationId: string,
    storeId: string,
    deliveryId: string,
    includePayment: boolean,
  ) {
    const job = await this.requireJob(organizationId, storeId, deliveryId);
    const readiness = await this.orders.getOrderReadinessByIds(organizationId, storeId, [
      job.orderId,
    ]);
    const orderMeta = readiness.get(job.orderId);
    const payment =
      includePayment && this.payments
        ? await this.payments.getOrderPaymentSummary(organizationId, storeId, job.orderId)
        : null;
    const nav = await this.navigationForPoint(
      organizationId,
      job.latitude,
      job.longitude,
      job.displayAddress,
    );
    const urgency = computeDeliveryUrgency({
      status: job.status as DeliveryStatus,
      windowStart: job.windowStart,
      requiredDispatchAt: job.requiredDispatchAt,
      serverNow: this.clock.now(),
      soonMinutes: this.soonMinutes,
    });
    return {
      delivery: job,
      orderNumber: orderMeta?.number ?? null,
      orderStatus: orderMeta?.status ?? null,
      orderReady: orderMeta?.status === 'READY' || orderMeta?.status === 'COMPLETED',
      urgency,
      payment,
      navigationUrl: nav.navigationUrl,
      mapsUrl: nav.mapsUrl,
      navigatorUrl: nav.navigatorUrl,
      openProblems: await this.deliveries.listOpenProblems(organizationId, deliveryId),
    };
  }

  async getBoard(organizationId: string, storeId: string, deliveryDate?: string) {
    await this.organizations.getStore(organizationId, storeId);
    const date = deliveryDate ? new Date(deliveryDate) : this.clock.now();
    const jobs = await this.deliveries.listJobs(organizationId, storeId, {
      deliveryDate: new Date(date.toISOString().slice(0, 10)),
    });
    const readiness = await this.orders.getOrderReadinessByIds(
      organizationId,
      storeId,
      jobs.map((j) => j.orderId),
    );
    const now = this.clock.now();
    const cards = jobs.map((job) => {
      const order = readiness.get(job.orderId);
      const urgency = computeDeliveryUrgency({
        status: job.status as DeliveryStatus,
        windowStart: job.windowStart,
        requiredDispatchAt: job.requiredDispatchAt,
        serverNow: now,
        soonMinutes: this.soonMinutes,
      });
      return {
        ...job,
        orderNumber: order?.number ?? null,
        orderStatus: order?.status ?? null,
        orderReady: order?.status === 'READY' || order?.status === 'COMPLETED',
        urgency,
      };
    });

    const section = (pred: (c: (typeof cards)[0]) => boolean) => cards.filter(pred);
    return {
      date: date.toISOString().slice(0, 10),
      sections: {
        needsPlanning: section((c) => c.status === DeliveryStatus.DRAFT),
        withoutCourier: section(
          (c) =>
            !c.assignedCourierId &&
            [DeliveryStatus.PLANNED, DeliveryStatus.READY_FOR_DISPATCH].includes(
              c.status as DeliveryStatus,
            ),
        ),
        orderPreparing: section(
          (c) =>
            !c.orderReady &&
            ![DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED].includes(
              c.status as DeliveryStatus,
            ),
        ),
        readyForDispatch: section((c) => c.status === DeliveryStatus.READY_FOR_DISPATCH),
        assigned: section((c) => c.status === DeliveryStatus.ASSIGNED),
        inTransit: section((c) => c.status === DeliveryStatus.IN_TRANSIT),
        problems: section((c) => c.status === DeliveryStatus.PROBLEM),
        delivered: section((c) => c.status === DeliveryStatus.DELIVERED),
      },
    };
  }

  async getMap(organizationId: string, storeId: string, deliveryDate?: string) {
    const board = await this.getBoard(organizationId, storeId, deliveryDate);
    const all = Object.values(board.sections).flat();
    const settings = resolveIntegrationSettings(
      await this.integrationSettings.findByOrganizationId(organizationId),
    );
    const withCoords = [];
    const needsAddress = [];
    for (const card of all) {
      const nav = await this.navigationForPoint(
        organizationId,
        card.latitude,
        card.longitude,
        card.displayAddress,
      );
      const point = {
        deliveryId: card.id,
        orderId: card.orderId,
        latitude: card.latitude,
        longitude: card.longitude,
        displayAddress: card.displayAddress,
        status: card.status,
        urgency: card.urgency,
        windowStart: card.windowStart,
        windowEnd: card.windowEnd,
        courierId: card.assignedCourierId,
        orderReady: card.orderReady,
        navigationUrl: nav.navigationUrl,
        mapsUrl: nav.mapsUrl,
        navigatorUrl: nav.navigatorUrl,
      };
      if (card.latitude && card.longitude) withCoords.push(point);
      else needsAddress.push(point);
    }
    return {
      date: board.date,
      mapConfig: {
        mapsEnabled:
          settings.geocodingProvider === 'yandex' && Boolean(settings.yandexMapsApiKey),
        yandexMapsApiKey: settings.yandexMapsApiKey,
        mapDefaultLatitude: settings.mapDefaultLatitude,
        mapDefaultLongitude: settings.mapDefaultLongitude,
      },
      points: withCoords,
      needsAddressClarification: needsAddress,
    };
  }

  async getCalendar(organizationId: string, storeId: string, deliveryDate?: string) {
    const board = await this.getBoard(organizationId, storeId, deliveryDate);
    const all = Object.values(board.sections).flat();
    const byHour = new Map<string, typeof all>();
    for (const card of all) {
      const hour = card.windowStart.toISOString().slice(0, 13);
      const list = byHour.get(hour) ?? [];
      list.push(card);
      byHour.set(hour, list);
    }
    return {
      date: board.date,
      hours: [...byHour.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([hour, deliveries]) => ({ hour, deliveries })),
    };
  }

  /** DeliveryReadinessPort — sync from Order MarkReady */
  async onOrderMarkedReady(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<void> {
    const job = await this.deliveries.findActiveByOrderId(organizationId, orderId);
    if (!job || job.storeId !== storeId) return;
    if (
      job.status !== DeliveryStatus.PLANNED &&
      job.status !== DeliveryStatus.ASSIGNED
    ) {
      return;
    }
    await this.uow.runInTransaction(async () => {
      const fresh = await this.deliveries.getJob(organizationId, storeId, job.id);
      if (!fresh) return;
      if (
        fresh.status !== DeliveryStatus.PLANNED &&
        fresh.status !== DeliveryStatus.ASSIGNED
      ) {
        return;
      }
      await this.bump(fresh, {
        status: DeliveryStatus.READY_FOR_DISPATCH,
      });
    });
  }

  /** DeliveryFulfillmentPort — PICKUP ↔ DELIVERY */
  async onFulfillmentTypeChanged(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    previousType: 'PICKUP' | 'DELIVERY';
    nextType: 'PICKUP' | 'DELIVERY';
    recipientName?: string | null;
    recipientPhone?: string | null;
    addressLine?: string | null;
    city?: string | null;
    apartment?: string | null;
    deliveryComment?: string | null;
    readyAt?: string | null;
  }): Promise<void> {
    if (input.previousType === input.nextType) return;

    if (input.nextType === 'PICKUP') {
      const active = await this.deliveries.findActiveByOrderId(
        input.organizationId,
        input.orderId,
      );
      if (!active) return;
      try {
        assertFulfillmentSwitchToPickupAllowed({
          status: active.status as DeliveryStatus,
          handedOverAt: active.handedOverAt,
        });
      } catch (e) {
        mapDomain(e);
      }
      await this.cancelDelivery({
        organizationId: input.organizationId,
        storeId: input.storeId,
        deliveryId: active.id,
        idempotencyKey: `fulfillment-pickup-${active.id}-${active.version}`,
        reason: 'Fulfillment changed to PICKUP',
        expectedVersion: active.version,
      });
      return;
    }

    if (!input.addressLine?.trim()) {
      throw new BadRequestException({
        code: 'ADDRESS_REQUIRED',
        message: 'Укажите адрес доставки при смене на доставку',
      });
    }

    await this.ensureDeliveryForOrder({
      organizationId: input.organizationId,
      storeId: input.storeId,
      orderId: input.orderId,
      addressLine: input.addressLine,
      city: input.city,
      apartment: input.apartment,
      deliveryComment: input.deliveryComment,
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      readyAt: input.readyAt,
    });
  }

  async ensureDeliveryForOrder(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    addressLine: string;
    city?: string | null;
    apartment?: string | null;
    deliveryComment?: string | null;
    recipientName?: string | null;
    recipientPhone?: string | null;
    readyAt?: string | null;
  }): Promise<void> {
    const existing = await this.deliveries.findActiveByOrderId(
      input.organizationId,
      input.orderId,
    );
    if (existing) return;

    const ready = input.readyAt ? new Date(input.readyAt) : this.clock.now();
    const windowStart = ready;
    const windowEnd = new Date(ready.getTime() + 2 * 60 * 60 * 1000);

    const job = await this.createDeliveryFromOrder({
      organizationId: input.organizationId,
      storeId: input.storeId,
      orderId: input.orderId,
      method: DeliveryMethod.OWN_COURIER,
      deliveryDate: ready.toISOString().slice(0, 10),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      addressLine: input.addressLine,
      city: input.city,
      apartment: input.apartment,
      deliveryComment: input.deliveryComment,
      deliveryFee: '0',
    });

    const planned = await this.planDelivery({
      organizationId: input.organizationId,
      storeId: input.storeId,
      deliveryId: job.id,
      expectedVersion: job.version,
    });

    try {
      await this.geocodeDelivery({
        organizationId: input.organizationId,
        storeId: input.storeId,
        deliveryId: job.id,
        expectedVersion: planned.version,
      });
    } catch {
      /* geocoding failure must not block delivery creation */
    }
  }

  async searchAddresses(input: {
    organizationId: string;
    storeId: string;
    query: string;
    city?: string;
  }) {
    const store = await this.organizations.getStore(input.organizationId, input.storeId);
    const city = input.city?.trim() || store.city?.trim() || undefined;
    const geocoding = await this.geocodingResolver.forOrganization(input.organizationId);
    return geocoding.searchAddress(input.query, {
      city,
      countryCode: undefined,
    });
  }

  private async navigationForPoint(
    organizationId: string,
    latitude: string | null | undefined,
    longitude: string | null | undefined,
    label?: string | null,
  ) {
    const settings = resolveIntegrationSettings(
      await this.integrationSettings.findByOrganizationId(organizationId),
    );
    const provider = settings.navigationProvider as NavigationProvider;
    if (latitude && longitude) {
      const links = buildNavigationLinks({
        provider,
        latitude,
        longitude,
        label,
      });
      return {
        navigationUrl: links.mapsUrl,
        mapsUrl: links.mapsUrl,
        navigatorUrl: links.navigatorUrl,
      };
    }
    const mapsUrl = label ? buildAddressMapsUrl(provider, label) : null;
    return {
      navigationUrl: mapsUrl,
      mapsUrl,
      navigatorUrl: null,
    };
  }
}

/** Empty city → store.city → last segment of store.address → Минск. */
function resolveDeliveryCity(
  inputCity: string | null | undefined,
  store: { city?: string | null; address?: string | null },
): string {
  const explicit = inputCity?.trim();
  if (explicit) return explicit;
  if (store.city?.trim()) return store.city.trim();
  const address = store.address?.trim();
  if (address) {
    const parts = address
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 1]!;
  }
  return 'Минск';
}
