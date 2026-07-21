import type {
  AddressSource,
  CourierStatus,
  DeliveryMethod,
  DeliveryProblemStatus,
  DeliveryProblemType,
  DeliveryStatus,
  DeliveryTimelineEventType,
  GeocodingStatus,
  RoutePlanStatus,
} from '../../domain/delivery-rules';

export const DELIVERY_REPOSITORY = Symbol('DELIVERY_REPOSITORY');

export type DeliveryJobView = {
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
  latitude: string | null;
  longitude: string | null;
  geocodingStatus: GeocodingStatus;
  addressSource: AddressSource | null;
  deliveryFee: string;
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
};

export type DeliveryAssignmentView = {
  id: string;
  organizationId: string;
  deliveryJobId: string;
  courierProfileId: string;
  assignedByMembershipId: string | null;
  assignedAt: Date;
  releasedAt: Date | null;
  releaseReason: string | null;
  createdAt: Date;
};

export type DeliveryProblemView = {
  id: string;
  organizationId: string;
  deliveryJobId: string;
  type: DeliveryProblemType;
  description: string;
  status: DeliveryProblemStatus;
  reportedByMembershipId: string | null;
  reportedAt: Date;
  resolvedByMembershipId: string | null;
  resolvedAt: Date | null;
  resolution: string | null;
  resolveToStatus: DeliveryStatus | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DeliveryTimelineEventView = {
  id: string;
  organizationId: string;
  deliveryJobId: string;
  type: DeliveryTimelineEventType | string;
  message: string | null;
  actorMembershipId: string | null;
  payload: unknown;
  occurredAt: Date;
  createdAt: Date;
};

export type CourierProfileView = {
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
};

export type DeliveryRoutePlanView = {
  id: string;
  organizationId: string;
  storeId: string;
  serviceDate: Date;
  courierProfileId: string | null;
  name: string;
  status: RoutePlanStatus;
  version: number;
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  stops: DeliveryRouteStopView[];
};

export type DeliveryRouteStopView = {
  id: string;
  organizationId: string;
  routePlanId: string;
  deliveryJobId: string;
  sequence: number;
  plannedArrivalAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type IdempotencyRecord = {
  id: string;
  organizationId: string;
  scope: string;
  key: string;
  documentId: string;
};

export type CreateDeliveryJobInput = {
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
  postalCode?: string | null;
  entrance?: string | null;
  floor?: string | null;
  apartment?: string | null;
  accessCode?: string | null;
  deliveryComment?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  geocodingStatus: GeocodingStatus;
  addressSource?: AddressSource | null;
  deliveryFee: string;
  currencyCode: string;
  externalReference?: string | null;
  providerName?: string | null;
  createdByMembershipId: string | null;
};

export interface DeliveryRepository {
  nextDeliveryNumber(organizationId: string): Promise<string>;

  createJob(input: CreateDeliveryJobInput): Promise<DeliveryJobView>;
  getJob(
    organizationId: string,
    storeId: string,
    deliveryId: string,
  ): Promise<DeliveryJobView | null>;
  findActiveByOrderId(
    organizationId: string,
    orderId: string,
  ): Promise<DeliveryJobView | null>;
  listJobs(
    organizationId: string,
    storeId: string,
    filter?: {
      status?: DeliveryStatus;
      deliveryDate?: Date;
      courierId?: string;
      from?: Date;
      to?: Date;
    },
  ): Promise<DeliveryJobView[]>;
  updateJob(
    organizationId: string,
    storeId: string,
    deliveryId: string,
    data: Partial<{
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
      latitude: string | null;
      longitude: string | null;
      geocodingStatus: GeocodingStatus;
      addressSource: AddressSource | null;
      deliveryFee: string;
      assignedCourierId: string | null;
      externalReference: string | null;
      providerName: string | null;
      handedOverAt: Date | null;
      departedAt: Date | null;
      deliveredAt: Date | null;
      cancelledAt: Date | null;
    }>,
    expectedVersion?: number,
  ): Promise<DeliveryJobView | null>;

  createAssignment(input: {
    id: string;
    organizationId: string;
    deliveryJobId: string;
    courierProfileId: string;
    assignedByMembershipId: string | null;
    assignedAt: Date;
  }): Promise<DeliveryAssignmentView>;
  releaseActiveAssignment(
    organizationId: string,
    deliveryJobId: string,
    releasedAt: Date,
    releaseReason: string | null,
  ): Promise<DeliveryAssignmentView | null>;
  getActiveAssignment(
    organizationId: string,
    deliveryJobId: string,
  ): Promise<DeliveryAssignmentView | null>;

  createProblem(input: {
    id: string;
    organizationId: string;
    deliveryJobId: string;
    type: DeliveryProblemType;
    description: string;
    reportedByMembershipId: string | null;
    reportedAt: Date;
  }): Promise<DeliveryProblemView>;
  getProblem(
    organizationId: string,
    deliveryJobId: string,
    problemId: string,
  ): Promise<DeliveryProblemView | null>;
  resolveProblem(input: {
    organizationId: string;
    problemId: string;
    resolution: string;
    resolveToStatus: DeliveryStatus;
    resolvedByMembershipId: string | null;
    resolvedAt: Date;
  }): Promise<DeliveryProblemView | null>;

  appendTimeline(input: {
    id: string;
    organizationId: string;
    deliveryJobId: string;
    type: DeliveryTimelineEventType;
    message: string | null;
    actorMembershipId: string | null;
    payload: Record<string, unknown> | null;
    occurredAt: Date;
  }): Promise<DeliveryTimelineEventView>;
  listTimeline(
    organizationId: string,
    deliveryJobId: string,
  ): Promise<DeliveryTimelineEventView[]>;

  createCourier(input: {
    id: string;
    organizationId: string;
    membershipId: string;
    displayNameSnapshot: string;
    phoneSnapshot: string | null;
    vehicleType: string | null;
    vehicleDescription: string | null;
  }): Promise<CourierProfileView>;
  getCourier(
    organizationId: string,
    courierId: string,
  ): Promise<CourierProfileView | null>;
  listCouriers(
    organizationId: string,
    status?: CourierStatus,
  ): Promise<CourierProfileView[]>;
  updateCourierStatus(
    organizationId: string,
    courierId: string,
    status: CourierStatus,
  ): Promise<CourierProfileView | null>;

  createRoutePlan(input: {
    id: string;
    organizationId: string;
    storeId: string;
    serviceDate: Date;
    courierProfileId: string | null;
    name: string;
    createdByMembershipId: string | null;
  }): Promise<DeliveryRoutePlanView>;
  getRoutePlan(
    organizationId: string,
    storeId: string,
    routeId: string,
  ): Promise<DeliveryRoutePlanView | null>;
  listRoutePlans(
    organizationId: string,
    storeId: string,
    filter?: { serviceDate?: Date; status?: RoutePlanStatus },
  ): Promise<DeliveryRoutePlanView[]>;
  updateRoutePlan(
    organizationId: string,
    storeId: string,
    routeId: string,
    data: Partial<{
      status: RoutePlanStatus;
      courierProfileId: string | null;
      name: string;
    }>,
    expectedVersion?: number,
  ): Promise<DeliveryRoutePlanView | null>;
  addRouteStop(input: {
    id: string;
    organizationId: string;
    routePlanId: string;
    deliveryJobId: string;
    sequence: number;
    plannedArrivalAt: Date | null;
    note: string | null;
  }): Promise<DeliveryRouteStopView>;
  findActiveStopForJob(
    organizationId: string,
    deliveryJobId: string,
  ): Promise<DeliveryRouteStopView | null>;
  reorderRouteStops(
    organizationId: string,
    routePlanId: string,
    orderedDeliveryJobIds: string[],
    expectedVersion: number,
  ): Promise<DeliveryRoutePlanView | null>;

  findIdempotency(
    organizationId: string,
    scope: string,
    key: string,
  ): Promise<IdempotencyRecord | null>;
  createIdempotency(input: {
    id: string;
    organizationId: string;
    scope: string;
    key: string;
    documentId: string;
  }): Promise<IdempotencyRecord>;
}
