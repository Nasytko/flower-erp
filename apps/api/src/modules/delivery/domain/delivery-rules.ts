import { Money } from '@flower/shared-kernel';

export enum DeliveryStatus {
  DRAFT = 'DRAFT',
  PLANNED = 'PLANNED',
  READY_FOR_DISPATCH = 'READY_FOR_DISPATCH',
  ASSIGNED = 'ASSIGNED',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  PROBLEM = 'PROBLEM',
  CANCELLED = 'CANCELLED',
}

export enum DeliveryMethod {
  OWN_COURIER = 'OWN_COURIER',
  TAXI = 'TAXI',
  THIRD_PARTY_SERVICE = 'THIRD_PARTY_SERVICE',
}

export enum GeocodingStatus {
  NOT_REQUESTED = 'NOT_REQUESTED',
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
  FAILED = 'FAILED',
  MANUAL = 'MANUAL',
}

export enum AddressSource {
  MANUAL = 'MANUAL',
  GEOCODED = 'GEOCODED',
  USER_PIN = 'USER_PIN',
}

export enum CourierStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum DeliveryProblemType {
  RECIPIENT_UNAVAILABLE = 'RECIPIENT_UNAVAILABLE',
  WRONG_ADDRESS = 'WRONG_ADDRESS',
  DELAY = 'DELAY',
  DAMAGED_ORDER = 'DAMAGED_ORDER',
  PAYMENT_ISSUE = 'PAYMENT_ISSUE',
  COURIER_ISSUE = 'COURIER_ISSUE',
  OTHER = 'OTHER',
}

export enum DeliveryProblemStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED',
}

export enum DeliveryTimelineEventType {
  DELIVERY_CREATED = 'DELIVERY_CREATED',
  DELIVERY_PLANNED = 'DELIVERY_PLANNED',
  ADDRESS_UPDATED = 'ADDRESS_UPDATED',
  COORDINATES_RESOLVED = 'COORDINATES_RESOLVED',
  COORDINATES_SET_MANUALLY = 'COORDINATES_SET_MANUALLY',
  COURIER_ASSIGNED = 'COURIER_ASSIGNED',
  COURIER_REASSIGNED = 'COURIER_REASSIGNED',
  COURIER_RELEASED = 'COURIER_RELEASED',
  READY_FOR_DISPATCH = 'READY_FOR_DISPATCH',
  HANDED_OVER = 'HANDED_OVER',
  IN_TRANSIT = 'IN_TRANSIT',
  PROBLEM_REPORTED = 'PROBLEM_REPORTED',
  PROBLEM_RESOLVED = 'PROBLEM_RESOLVED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  ROUTE_ASSIGNED = 'ROUTE_ASSIGNED',
  ROUTE_ORDER_CHANGED = 'ROUTE_ORDER_CHANGED',
}

export enum RoutePlanStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export type DeliveryUrgency = 'NORMAL' | 'SOON' | 'URGENT' | 'OVERDUE';

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

const TERMINAL: ReadonlySet<DeliveryStatus> = new Set([
  DeliveryStatus.DELIVERED,
  DeliveryStatus.CANCELLED,
]);

/** Plan draft → planned. */
const PLAN_FROM = new Set([DeliveryStatus.DRAFT]);

/** Assign / reassign allowed from these statuses. */
const ASSIGNABLE = new Set([
  DeliveryStatus.PLANNED,
  DeliveryStatus.READY_FOR_DISPATCH,
  DeliveryStatus.ASSIGNED,
]);

/** Ready-for-dispatch sync / command. */
const READY_DISPATCH_FROM = new Set([
  DeliveryStatus.PLANNED,
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.READY_FOR_DISPATCH,
]);

/** Handover / start transit. */
const DISPATCHABLE = new Set([
  DeliveryStatus.READY_FOR_DISPATCH,
  DeliveryStatus.ASSIGNED,
]);

const PROBLEM_FROM = new Set([
  DeliveryStatus.PLANNED,
  DeliveryStatus.READY_FOR_DISPATCH,
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.IN_TRANSIT,
]);

const CANCEL_FROM = new Set([
  DeliveryStatus.DRAFT,
  DeliveryStatus.PLANNED,
  DeliveryStatus.READY_FOR_DISPATCH,
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.IN_TRANSIT,
  DeliveryStatus.PROBLEM,
]);

const PROBLEM_RESOLVE_TARGETS = new Set([
  DeliveryStatus.PLANNED,
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.IN_TRANSIT,
  DeliveryStatus.DELIVERED,
  DeliveryStatus.CANCELLED,
]);

export function assertTimeWindowValid(windowStart: Date, windowEnd: Date): void {
  if (windowEnd.getTime() < windowStart.getTime()) {
    throw new DomainError('INVALID_TIME_WINDOW', 'windowEnd must be >= windowStart');
  }
}

export function assertDeliveryFeeNonNegative(fee: string | Money): void {
  const money = fee instanceof Money ? fee : new Money(fee);
  if (money.lt(0)) {
    throw new DomainError('INVALID_DELIVERY_FEE', 'Delivery fee must be >= 0');
  }
}

export function computeRequiredDispatchAt(windowStart: Date, bufferMinutes: number): Date {
  return new Date(windowStart.getTime() - bufferMinutes * 60_000);
}

/**
 * Urgency from server now vs windowStart / requiredDispatchAt.
 * OVERDUE: past windowStart (or past requiredDispatchAt if set and still not in transit+).
 * URGENT/SOON: within soonMinutes of dispatch/window.
 */
export function computeDeliveryUrgency(input: {
  status: DeliveryStatus;
  windowStart: Date;
  requiredDispatchAt: Date | null;
  serverNow: Date;
  soonMinutes: number;
}): DeliveryUrgency {
  if (
    input.status === DeliveryStatus.DELIVERED ||
    input.status === DeliveryStatus.CANCELLED
  ) {
    return 'NORMAL';
  }

  const anchor = input.requiredDispatchAt ?? input.windowStart;
  const ms = anchor.getTime() - input.serverNow.getTime();
  if (ms < 0) return 'OVERDUE';
  const soonMs = input.soonMinutes * 60_000;
  if (ms <= soonMs / 2) return 'URGENT';
  if (ms <= soonMs) return 'SOON';
  return 'NORMAL';
}

export function assertCanPlan(status: DeliveryStatus): void {
  if (!PLAN_FROM.has(status) && status !== DeliveryStatus.PLANNED) {
    throw new DomainError('INVALID_STATUS_TRANSITION', `Cannot plan from ${status}`);
  }
}

export function assertCanAssign(input: {
  status: DeliveryStatus;
  courierStatus: CourierStatus;
  courierOrganizationId: string;
  deliveryOrganizationId: string;
}): void {
  if (TERMINAL.has(input.status) || input.status === DeliveryStatus.IN_TRANSIT) {
    throw new DomainError('CANNOT_ASSIGN', `Cannot assign courier in status ${input.status}`);
  }
  if (!ASSIGNABLE.has(input.status) && input.status !== DeliveryStatus.DRAFT) {
    throw new DomainError('CANNOT_ASSIGN', `Cannot assign courier in status ${input.status}`);
  }
  if (input.courierStatus !== CourierStatus.ACTIVE) {
    throw new DomainError('COURIER_NOT_ACTIVE', 'Courier profile is not active');
  }
  if (input.courierOrganizationId !== input.deliveryOrganizationId) {
    throw new DomainError('COURIER_ORG_MISMATCH', 'Courier belongs to another organization');
  }
}

export function assertCanMarkReadyForDispatch(
  status: DeliveryStatus,
  orderIsReady: boolean,
): void {
  if (!orderIsReady) {
    throw new DomainError('ORDER_NOT_READY', 'Order must be READY before ready-for-dispatch');
  }
  if (!READY_DISPATCH_FROM.has(status)) {
    throw new DomainError(
      'INVALID_STATUS_TRANSITION',
      `Cannot mark ready for dispatch from ${status}`,
    );
  }
}

export function assertCanHandover(status: DeliveryStatus, orderIsReady: boolean): void {
  if (!orderIsReady) {
    throw new DomainError('ORDER_NOT_READY', 'Order must be READY before handover');
  }
  if (!DISPATCHABLE.has(status)) {
    throw new DomainError('INVALID_STATUS_TRANSITION', `Cannot handover from ${status}`);
  }
}

export function assertCanStartTransit(input: {
  status: DeliveryStatus;
  method: DeliveryMethod;
  hasActiveAssignment: boolean;
  hasExternalReference: boolean;
}): void {
  if (!DISPATCHABLE.has(input.status) && input.status !== DeliveryStatus.IN_TRANSIT) {
    throw new DomainError('INVALID_STATUS_TRANSITION', `Cannot start transit from ${input.status}`);
  }
  if (input.method === DeliveryMethod.OWN_COURIER && !input.hasActiveAssignment) {
    throw new DomainError('ASSIGNMENT_REQUIRED', 'OWN_COURIER requires an active assignment');
  }
  if (
    (input.method === DeliveryMethod.TAXI ||
      input.method === DeliveryMethod.THIRD_PARTY_SERVICE) &&
    !input.hasActiveAssignment &&
    !input.hasExternalReference
  ) {
    throw new DomainError(
      'EXTERNAL_REFERENCE_REQUIRED',
      'Taxi/third-party delivery requires external reference or assignment',
    );
  }
}

export function assertCanDeliver(status: DeliveryStatus): void {
  if (status !== DeliveryStatus.IN_TRANSIT && status !== DeliveryStatus.PROBLEM) {
    throw new DomainError('INVALID_STATUS_TRANSITION', `Cannot deliver from ${status}`);
  }
}

export function assertCanCancel(status: DeliveryStatus): void {
  if (!CANCEL_FROM.has(status)) {
    throw new DomainError('INVALID_STATUS_TRANSITION', `Cannot cancel from ${status}`);
  }
}

export function assertCanReportProblem(status: DeliveryStatus): void {
  if (!PROBLEM_FROM.has(status)) {
    throw new DomainError('INVALID_STATUS_TRANSITION', `Cannot report problem from ${status}`);
  }
}

export function assertCanResolveProblem(resolveTo: DeliveryStatus): void {
  if (!PROBLEM_RESOLVE_TARGETS.has(resolveTo)) {
    throw new DomainError(
      'INVALID_RESOLVE_STATUS',
      `Cannot resolve problem to ${resolveTo}`,
    );
  }
}

/** Fulfillment DELIVERY→PICKUP allowed only before handover and not in transit/delivered. */
export function assertFulfillmentSwitchToPickupAllowed(input: {
  status: DeliveryStatus;
  handedOverAt: Date | null;
}): void {
  if (input.handedOverAt || input.status === DeliveryStatus.IN_TRANSIT) {
    throw new DomainError(
      'FULFILLMENT_CHANGE_FORBIDDEN',
      'Cannot switch to PICKUP after courier handover',
    );
  }
  if (input.status === DeliveryStatus.DELIVERED) {
    throw new DomainError(
      'FULFILLMENT_CHANGE_FORBIDDEN',
      'Cannot switch to PICKUP after delivery completed',
    );
  }
}

export function isActiveDeliveryStatus(status: DeliveryStatus): boolean {
  return status !== DeliveryStatus.CANCELLED;
}

export function statusAfterAssign(current: DeliveryStatus): DeliveryStatus {
  if (current === DeliveryStatus.READY_FOR_DISPATCH) {
    return DeliveryStatus.READY_FOR_DISPATCH;
  }
  return DeliveryStatus.ASSIGNED;
}

export function statusAfterReadyForDispatch(_current: DeliveryStatus): DeliveryStatus {
  return DeliveryStatus.READY_FOR_DISPATCH;
}

export function buildDisplayAddress(parts: {
  addressLine: string;
  city: string;
  postalCode?: string | null;
  entrance?: string | null;
  floor?: string | null;
  apartment?: string | null;
}): string {
  const bits = [parts.addressLine, parts.city];
  if (parts.postalCode) bits.push(parts.postalCode);
  const extras: string[] = [];
  if (parts.entrance) extras.push(`ent. ${parts.entrance}`);
  if (parts.floor) extras.push(`fl. ${parts.floor}`);
  if (parts.apartment) extras.push(`apt. ${parts.apartment}`);
  if (extras.length) bits.push(extras.join(', '));
  return bits.filter(Boolean).join(', ');
}
