export enum OrderStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  PARTIALLY_RESERVED = 'PARTIALLY_RESERVED',
  RESERVED = 'RESERVED',
  IN_PREPARATION = 'IN_PREPARATION',
  READY = 'READY',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum OrderType {
  PICKUP = 'PICKUP',
  DELIVERY = 'DELIVERY',
}

export enum OrderOccasion {
  BIRTHDAY = 'BIRTHDAY',
  WEDDING = 'WEDDING',
  ROMANTIC = 'ROMANTIC',
  CORPORATE = 'CORPORATE',
  FUNERAL = 'FUNERAL',
  MOTHER_DAY = 'MOTHER_DAY',
  NEW_YEAR = 'NEW_YEAR',
  OTHER = 'OTHER',
}

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function assertDraftEditable(status: OrderStatus): void {
  if (status !== OrderStatus.DRAFT) {
    throw new DomainError('ORDER_NOT_DRAFT', 'Order can be edited only in DRAFT status');
  }
}

export function assertCanConfirm(status: OrderStatus, compositionItemCount: number): void {
  if (status !== OrderStatus.DRAFT) {
    throw new DomainError('ORDER_NOT_DRAFT', 'Only DRAFT orders can be confirmed');
  }
  if (compositionItemCount < 1) {
    throw new DomainError('ORDER_EMPTY', 'Order must have at least one composition item');
  }
}

export function assertCanReserve(status: OrderStatus): void {
  if (
    status !== OrderStatus.CONFIRMED &&
    status !== OrderStatus.PARTIALLY_RESERVED &&
    status !== OrderStatus.RESERVED
  ) {
    throw new DomainError('ORDER_NOT_RESERVABLE', 'Reservation retry requires CONFIRMED, PARTIALLY_RESERVED, or RESERVED');
  }
}

export function assertCanAssign(status: OrderStatus): void {
  if (
    status === OrderStatus.DRAFT ||
    status === OrderStatus.COMPLETED ||
    status === OrderStatus.CANCELLED
  ) {
    throw new DomainError('ORDER_NOT_ASSIGNABLE', 'Cannot assign florist in this status');
  }
}

export function assertCanStartPreparation(status: OrderStatus, hasActiveAssignment: boolean): void {
  if (status !== OrderStatus.RESERVED && status !== OrderStatus.PARTIALLY_RESERVED) {
    throw new DomainError(
      'ORDER_NOT_READY_FOR_PREP',
      'Preparation requires RESERVED or PARTIALLY_RESERVED',
    );
  }
  if (!hasActiveAssignment) {
    throw new DomainError('ORDER_NO_ASSIGNEE', 'Florist must be assigned before preparation');
  }
}

export function assertCanEditActual(status: OrderStatus): void {
  if (status !== OrderStatus.IN_PREPARATION) {
    throw new DomainError('ACTUAL_LOCKED', 'Actual composition editable only in IN_PREPARATION');
  }
}

export function assertCanMarkReady(status: OrderStatus): void {
  if (status !== OrderStatus.IN_PREPARATION) {
    throw new DomainError('ORDER_NOT_IN_PREPARATION', 'Ready requires IN_PREPARATION');
  }
}

export function assertCanComplete(status: OrderStatus): void {
  if (status !== OrderStatus.READY) {
    throw new DomainError('ORDER_NOT_READY', 'Complete requires READY status');
  }
}

export function assertCanCancel(status: OrderStatus): void {
  if (status === OrderStatus.COMPLETED || status === OrderStatus.CANCELLED) {
    throw new DomainError('ORDER_TERMINAL', 'Order cannot be cancelled');
  }
}

/** Statuses eligible for ClaimNext / Claim (never DRAFT/READY/COMPLETED/CANCELLED). */
export const CLAIM_ELIGIBLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PARTIALLY_RESERVED,
  OrderStatus.RESERVED,
  OrderStatus.IN_PREPARATION,
] as const;

export function isClaimEligibleStatus(status: OrderStatus | string): boolean {
  return (CLAIM_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

/**
 * ClaimNext eligibility: same-store unassigned order in claimable status.
 * IN_PREPARATION with another assignee is excluded via activeMembershipId check.
 */
export function isEligibleForClaimNext(input: {
  status: OrderStatus | string;
  storeId: string;
  targetStoreId: string;
  activeAssigneeMembershipId: string | null;
}): boolean {
  if (input.storeId !== input.targetStoreId) return false;
  if (!isClaimEligibleStatus(input.status)) return false;
  if (input.activeAssigneeMembershipId) return false;
  return true;
}

/** Display priority bucket for claim-next ordering (lower = higher priority). */
export function claimNextPriorityBucket(
  status: OrderStatus | string,
  readyAt: Date | null,
  now: Date,
  soonMinutes: number,
): number {
  if (readyAt && readyAt.getTime() < now.getTime()) return 0; // overdue
  const soonMs = soonMinutes * 60_000;
  if (readyAt && readyAt.getTime() <= now.getTime() + soonMs) return 1; // soon
  if (status === OrderStatus.IN_PREPARATION) return 2;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (readyAt && readyAt >= start && readyAt <= end) return 3; // readyAt today
  return 4;
}

export function assertQuantityPositive(quantity: string): void {
  const value = Number(quantity);
  if (!Number.isFinite(value) || value <= 0) {
    throw new DomainError('INVALID_QUANTITY', 'Quantity must be greater than zero');
  }
}

export function statusFromReservationOutcome(
  outcome: 'FULL' | 'PARTIAL' | 'NONE',
): OrderStatus {
  if (outcome === 'FULL') return OrderStatus.RESERVED;
  if (outcome === 'PARTIAL') return OrderStatus.PARTIALLY_RESERVED;
  return OrderStatus.CONFIRMED;
}

export function assertPhone(phone: string): void {
  const trimmed = phone.trim();
  if (trimmed.length < 5) {
    throw new DomainError('INVALID_PHONE', 'Phone is required');
  }
}

export function assertCustomerName(name: string): void {
  if (!name.trim()) {
    throw new DomainError('INVALID_NAME', 'Customer name is required');
  }
}
