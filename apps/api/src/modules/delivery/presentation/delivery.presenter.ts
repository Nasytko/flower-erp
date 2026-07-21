import type { DeliveryJobView } from '../application/ports/delivery.repository';

export function presentDelivery(job: DeliveryJobView) {
  return {
    ...job,
    deliveryDate: job.deliveryDate.toISOString().slice(0, 10),
    windowStart: job.windowStart.toISOString(),
    windowEnd: job.windowEnd.toISOString(),
    requiredDispatchAt: job.requiredDispatchAt?.toISOString() ?? null,
    handedOverAt: job.handedOverAt?.toISOString() ?? null,
    departedAt: job.departedAt?.toISOString() ?? null,
    deliveredAt: job.deliveredAt?.toISOString() ?? null,
    cancelledAt: job.cancelledAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function presentCourier(row: {
  id: string;
  organizationId: string;
  membershipId: string;
  displayNameSnapshot: string;
  phoneSnapshot: string | null;
  status: string;
  vehicleType: string | null;
  vehicleDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function presentRoute(plan: {
  id: string;
  organizationId: string;
  storeId: string;
  serviceDate: Date;
  courierProfileId: string | null;
  name: string;
  status: string;
  version: number;
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  stops: Array<{
    id: string;
    deliveryJobId: string;
    sequence: number;
    plannedArrivalAt: Date | null;
    note: string | null;
  }>;
}) {
  return {
    ...plan,
    serviceDate: plan.serviceDate.toISOString().slice(0, 10),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    stops: plan.stops.map((s) => ({
      ...s,
      plannedArrivalAt: s.plannedArrivalAt?.toISOString() ?? null,
    })),
  };
}
