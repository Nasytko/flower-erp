import type {
  AddressSource,
  CourierStatus,
  DeliveryMethod,
  DeliveryProblemStatus,
  DeliveryProblemType,
  DeliveryStatus,
  GeocodingStatus,
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
  listOpenProblems(
    organizationId: string,
    deliveryJobId: string,
  ): Promise<DeliveryProblemView[]>;

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
  findCourierByMembershipId(
    organizationId: string,
    membershipId: string,
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
