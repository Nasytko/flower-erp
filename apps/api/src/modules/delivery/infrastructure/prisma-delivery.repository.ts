import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { allocateOrgDocumentNumber } from '../../../infrastructure/ids/org-document-number';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  AddressSource,
  CourierStatus,
  DeliveryMethod,
  DeliveryProblemStatus,
  DeliveryProblemType,
  DeliveryStatus,
  GeocodingStatus,
} from '../domain/delivery-rules';
import type {
  CourierProfileView,
  CreateDeliveryJobInput,
  DeliveryAssignmentView,
  DeliveryJobView,
  DeliveryProblemView,
  DeliveryRepository,
  IdempotencyRecord,
} from '../application/ports/delivery.repository';

function money(v: Prisma.Decimal): string {
  return v.toFixed(2);
}

function coord(v: Prisma.Decimal | null | undefined): string | null {
  return v == null ? null : v.toFixed(7);
}

function mapJob(row: {
  id: string;
  organizationId: string;
  storeId: string;
  orderId: string;
  number: string;
  status: DeliveryStatus;
  method: DeliveryMethod;
  deliveryDate: Date;
  windowStart: Date;
  windowEnd: Date;
  requiredDispatchAt: Date | null;
  recipientName: string;
  recipientPhone: string;
  displayAddress: string;
  addressLine: string;
  city: string;
  postalCode: string | null;
  entrance: string | null;
  floor: string | null;
  apartment: string | null;
  accessCode: string | null;
  deliveryComment: string | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  geocodingStatus: GeocodingStatus;
  addressSource: AddressSource | null;
  deliveryFee: Prisma.Decimal;
  currencyCode: string;
  assignedCourierId: string | null;
  externalReference: string | null;
  providerName: string | null;
  handedOverAt: Date | null;
  departedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  version: number;
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DeliveryJobView {
  return {
    ...row,
    latitude: coord(row.latitude),
    longitude: coord(row.longitude),
    deliveryFee: money(row.deliveryFee),
  };
}

function mapCourier(row: {
  id: string;
  organizationId: string;
  membershipId: string;
  displayNameSnapshot: string;
  phoneSnapshot: string | null;
  status: CourierStatus;
  vehicleType: string | null;
  vehicleDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CourierProfileView {
  return { ...row };
}

@Injectable()
export class PrismaDeliveryRepository implements DeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async nextDeliveryNumber(organizationId: string): Promise<string> {
    return allocateOrgDocumentNumber({
      prefix: 'DEL',
      organizationId,
      exists: async (number) =>
        Boolean(
          await this.client().deliveryJob.findFirst({
            where: { organizationId, number },
            select: { id: true },
          }),
        ),
      listByNumberPrefix: async (dayPrefix) => {
        const rows = await this.client().deliveryJob.findMany({
          where: { organizationId, number: { startsWith: dayPrefix } },
          select: { number: true },
        });
        return rows.map((r) => r.number);
      },
    });
  }

  async createJob(input: CreateDeliveryJobInput): Promise<DeliveryJobView> {
    const row = await this.client().deliveryJob.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        storeId: input.storeId,
        orderId: input.orderId,
        number: input.number,
        status: input.status,
        method: input.method,
        deliveryDate: input.deliveryDate,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        requiredDispatchAt: input.requiredDispatchAt,
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        displayAddress: input.displayAddress,
        addressLine: input.addressLine,
        city: input.city,
        postalCode: input.postalCode ?? null,
        entrance: input.entrance ?? null,
        floor: input.floor ?? null,
        apartment: input.apartment ?? null,
        accessCode: input.accessCode ?? null,
        deliveryComment: input.deliveryComment ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        geocodingStatus: input.geocodingStatus,
        addressSource: input.addressSource ?? null,
        deliveryFee: input.deliveryFee,
        currencyCode: input.currencyCode,
        externalReference: input.externalReference ?? null,
        providerName: input.providerName ?? null,
        createdByMembershipId: input.createdByMembershipId,
      },
    });
    return mapJob(row as Parameters<typeof mapJob>[0]);
  }

  async getJob(
    organizationId: string,
    storeId: string,
    deliveryId: string,
  ): Promise<DeliveryJobView | null> {
    const row = await this.client().deliveryJob.findFirst({
      where: { id: deliveryId, organizationId, storeId },
    });
    return row ? mapJob(row as Parameters<typeof mapJob>[0]) : null;
  }

  async findActiveByOrderId(
    organizationId: string,
    orderId: string,
  ): Promise<DeliveryJobView | null> {
    const row = await this.client().deliveryJob.findFirst({
      where: { organizationId, orderId, status: { not: 'CANCELLED' } },
    });
    return row ? mapJob(row as Parameters<typeof mapJob>[0]) : null;
  }

  async listJobs(
    organizationId: string,
    storeId: string,
    filter?: {
      status?: DeliveryStatus;
      deliveryDate?: Date;
      courierId?: string;
      from?: Date;
      to?: Date;
    },
  ): Promise<DeliveryJobView[]> {
    const rows = await this.client().deliveryJob.findMany({
      where: {
        organizationId,
        storeId,
        status: filter?.status,
        deliveryDate: filter?.deliveryDate,
        assignedCourierId: filter?.courierId,
        windowStart:
          filter?.from || filter?.to
            ? {
                gte: filter.from,
                lte: filter.to,
              }
            : undefined,
      },
      orderBy: [{ windowStart: 'asc' }, { number: 'asc' }],
    });
    return rows.map((r) => mapJob(r as Parameters<typeof mapJob>[0]));
  }

  async updateJob(
    organizationId: string,
    storeId: string,
    deliveryId: string,
    data: Record<string, unknown>,
    expectedVersion?: number,
  ): Promise<DeliveryJobView | null> {
    const where: Prisma.DeliveryJobWhereInput = {
      id: deliveryId,
      organizationId,
      storeId,
    };
    if (expectedVersion !== undefined) {
      where.version = expectedVersion;
    }
    const existing = await this.client().deliveryJob.findFirst({ where });
    if (!existing) return null;

    const row = await this.client().deliveryJob.update({
      where: { id: deliveryId },
      data: {
        ...data,
        version: expectedVersion !== undefined ? expectedVersion + 1 : undefined,
        updatedAt: new Date(),
      },
    });
    return mapJob(row as Parameters<typeof mapJob>[0]);
  }

  async createAssignment(input: {
    id: string;
    organizationId: string;
    deliveryJobId: string;
    courierProfileId: string;
    assignedByMembershipId: string | null;
    assignedAt: Date;
  }): Promise<DeliveryAssignmentView> {
    const row = await this.client().deliveryAssignment.create({
      data: input,
    });
    return row as DeliveryAssignmentView;
  }

  async releaseActiveAssignment(
    organizationId: string,
    deliveryJobId: string,
    releasedAt: Date,
    releaseReason: string | null,
  ): Promise<DeliveryAssignmentView | null> {
    const active = await this.client().deliveryAssignment.findFirst({
      where: { organizationId, deliveryJobId, releasedAt: null },
    });
    if (!active) return null;
    const row = await this.client().deliveryAssignment.update({
      where: { id: active.id },
      data: { releasedAt, releaseReason },
    });
    return row as DeliveryAssignmentView;
  }

  async getActiveAssignment(
    organizationId: string,
    deliveryJobId: string,
  ): Promise<DeliveryAssignmentView | null> {
    const row = await this.client().deliveryAssignment.findFirst({
      where: { organizationId, deliveryJobId, releasedAt: null },
    });
    return row as DeliveryAssignmentView | null;
  }

  async createProblem(input: {
    id: string;
    organizationId: string;
    deliveryJobId: string;
    type: DeliveryProblemType;
    description: string;
    reportedByMembershipId: string | null;
    reportedAt: Date;
  }): Promise<DeliveryProblemView> {
    const row = await this.client().deliveryProblem.create({
      data: {
        ...input,
        status: 'OPEN',
      },
    });
    return row as DeliveryProblemView;
  }

  async getProblem(
    organizationId: string,
    deliveryJobId: string,
    problemId: string,
  ): Promise<DeliveryProblemView | null> {
    const row = await this.client().deliveryProblem.findFirst({
      where: { id: problemId, organizationId, deliveryJobId },
    });
    return row as DeliveryProblemView | null;
  }

  async resolveProblem(input: {
    organizationId: string;
    problemId: string;
    resolution: string;
    resolveToStatus: DeliveryStatus;
    resolvedByMembershipId: string | null;
    resolvedAt: Date;
  }): Promise<DeliveryProblemView | null> {
    const existing = await this.client().deliveryProblem.findFirst({
      where: { id: input.problemId, organizationId: input.organizationId },
    });
    if (!existing) return null;
    const row = await this.client().deliveryProblem.update({
      where: { id: input.problemId },
      data: {
        status: 'RESOLVED' as DeliveryProblemStatus,
        resolution: input.resolution,
        resolveToStatus: input.resolveToStatus,
        resolvedByMembershipId: input.resolvedByMembershipId,
        resolvedAt: input.resolvedAt,
      },
    });
    return row as DeliveryProblemView;
  }

  async listOpenProblems(
    organizationId: string,
    deliveryJobId: string,
  ): Promise<DeliveryProblemView[]> {
    const rows = await this.client().deliveryProblem.findMany({
      where: { organizationId, deliveryJobId, status: 'OPEN' },
      orderBy: { reportedAt: 'asc' },
    });
    return rows as DeliveryProblemView[];
  }

  async createCourier(input: {
    id: string;
    organizationId: string;
    membershipId: string;
    displayNameSnapshot: string;
    phoneSnapshot: string | null;
    vehicleType: string | null;
    vehicleDescription: string | null;
  }): Promise<CourierProfileView> {
    const row = await this.client().courierProfile.create({
      data: { ...input, status: 'ACTIVE' },
    });
    return mapCourier(row as Parameters<typeof mapCourier>[0]);
  }

  async getCourier(
    organizationId: string,
    courierId: string,
  ): Promise<CourierProfileView | null> {
    const row = await this.client().courierProfile.findFirst({
      where: { id: courierId, organizationId },
    });
    return row ? mapCourier(row as Parameters<typeof mapCourier>[0]) : null;
  }

  async findCourierByMembershipId(
    organizationId: string,
    membershipId: string,
  ): Promise<CourierProfileView | null> {
    const row = await this.client().courierProfile.findFirst({
      where: { organizationId, membershipId },
    });
    return row ? mapCourier(row as Parameters<typeof mapCourier>[0]) : null;
  }

  async listCouriers(
    organizationId: string,
    status?: CourierStatus,
  ): Promise<CourierProfileView[]> {
    const rows = await this.client().courierProfile.findMany({
      where: { organizationId, status },
      orderBy: { displayNameSnapshot: 'asc' },
    });
    return rows.map((r) => mapCourier(r as Parameters<typeof mapCourier>[0]));
  }

  async updateCourierStatus(
    organizationId: string,
    courierId: string,
    status: CourierStatus,
  ): Promise<CourierProfileView | null> {
    const existing = await this.getCourier(organizationId, courierId);
    if (!existing) return null;
    const row = await this.client().courierProfile.update({
      where: { id: courierId },
      data: { status },
    });
    return mapCourier(row as Parameters<typeof mapCourier>[0]);
  }

  async findIdempotency(
    organizationId: string,
    scope: string,
    key: string,
  ): Promise<IdempotencyRecord | null> {
    const row = await this.client().postingIdempotencyKey.findFirst({
      where: { organizationId, scope, key },
    });
    return row
      ? {
          id: row.id,
          organizationId: row.organizationId,
          scope: row.scope,
          key: row.key,
          documentId: row.documentId,
        }
      : null;
  }

  async createIdempotency(input: {
    id: string;
    organizationId: string;
    scope: string;
    key: string;
    documentId: string;
  }): Promise<IdempotencyRecord> {
    const row = await this.client().postingIdempotencyKey.create({ data: input });
    return {
      id: row.id,
      organizationId: row.organizationId,
      scope: row.scope,
      key: row.key,
      documentId: row.documentId,
    };
  }
}
