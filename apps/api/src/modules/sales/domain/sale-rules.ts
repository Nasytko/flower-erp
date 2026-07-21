import { Money } from '@flower/shared-kernel';

export enum SaleStatus {
  DRAFT = 'DRAFT',
  COMPLETED = 'COMPLETED',
  ANNULLED = 'ANNULLED',
}

export enum SaleType {
  ORDER_BASED = 'ORDER_BASED',
  DIRECT = 'DIRECT',
}

export enum DiscountType {
  NONE = 'NONE',
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}

export enum DiscountReason {
  PROMOTION = 'PROMOTION',
  LOYAL_CUSTOMER = 'LOYAL_CUSTOMER',
  AGED_FLOWERS = 'AGED_FLOWERS',
  MANAGER_DECISION = 'MANAGER_DECISION',
  OTHER = 'OTHER',
}

export enum SalesChannel {
  STORE = 'STORE',
  PHONE = 'PHONE',
  WEBSITE = 'WEBSITE',
  TELEGRAM = 'TELEGRAM',
  OTHER = 'OTHER',
}

export enum SaleInventorySourceType {
  ORDER_ACTUAL_COMPOSITION = 'ORDER_ACTUAL_COMPOSITION',
  DIRECT_COMPOSITION = 'DIRECT_COMPOSITION',
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

function d(value: string | number | Money): Money {
  return value instanceof Money ? value : new Money(value);
}

export function computeGross(lineGrossAmounts: readonly string[]): string {
  let total = Money.zero();
  for (const amount of lineGrossAmounts) {
    total = total.plus(amount);
  }
  return total.toFixed(2);
}

export function applyDiscount(type: DiscountType, value: string, gross: string): string {
  const grossAmt = d(gross);
  if (grossAmt.lt(0)) {
    throw new DomainError('INVALID_GROSS', 'Gross amount must be non-negative');
  }
  if (type === DiscountType.NONE) {
    return '0.00';
  }
  const raw = d(value);
  if (raw.lt(0)) {
    throw new DomainError('INVALID_DISCOUNT', 'Discount value must be non-negative');
  }
  if (type === DiscountType.PERCENT) {
    const amount = grossAmt.mul(raw).div(100).round(2);
    return Money.min(amount, grossAmt).toFixed(2);
  }
  return Money.min(raw.round(2), grossAmt).toFixed(2);
}

export function computeNet(gross: string, discountAmount: string): string {
  const net = d(gross).minus(d(discountAmount));
  if (net.lt(0)) {
    throw new DomainError('INVALID_NET', 'Net amount cannot be negative');
  }
  return net.toFixed(2);
}

export function computeMargin(
  netAmount: string,
  costAmount: string,
): { grossProfitAmount: string; marginPercent: string | null } {
  const net = d(netAmount);
  const cost = d(costAmount);
  const profit = net.minus(cost);
  const marginPercent = net.gt(0) ? profit.div(net).mul(100).toFixed(4) : null;
  return {
    grossProfitAmount: profit.toFixed(4),
    marginPercent,
  };
}

export function lineGross(quantity: string, unitPrice: string): string {
  return d(quantity).mul(d(unitPrice)).round(2).toFixed(2);
}

export function assertDraft(status: SaleStatus): void {
  if (status !== SaleStatus.DRAFT) {
    throw new DomainError('SALE_NOT_DRAFT', 'Sale can be edited only in DRAFT status');
  }
}

export function assertCanComplete(status: SaleStatus): void {
  if (status !== SaleStatus.DRAFT) {
    throw new DomainError('SALE_NOT_COMPLETABLE', 'Only DRAFT sales can be completed');
  }
}

export function assertCanAnnul(status: SaleStatus): void {
  if (status !== SaleStatus.COMPLETED) {
    throw new DomainError('SALE_NOT_ANNULLABLE', 'Only COMPLETED sales can be annulled');
  }
}

export function validateDiscount(
  type: DiscountType,
  value: string,
  gross: string,
  overridePercent: number,
  hasOverridePermission: boolean,
): void {
  if (type === DiscountType.NONE) {
    if (!d(value).eq(0)) {
      throw new DomainError('INVALID_DISCOUNT', 'NONE discount must have value 0');
    }
    return;
  }

  const grossAmt = d(gross);
  const raw = d(value);
  if (raw.lt(0)) {
    throw new DomainError('INVALID_DISCOUNT', 'Discount value must be non-negative');
  }

  let effectivePercent: Money;
  if (type === DiscountType.PERCENT) {
    if (raw.gt(100)) {
      throw new DomainError('INVALID_DISCOUNT', 'Percent discount cannot exceed 100');
    }
    effectivePercent = raw;
  } else {
    if (raw.gt(grossAmt)) {
      throw new DomainError('INVALID_DISCOUNT', 'Fixed discount cannot exceed gross amount');
    }
    effectivePercent = grossAmt.gt(0) ? raw.div(grossAmt).mul(100) : Money.zero();
  }

  if (effectivePercent.gt(overridePercent) && !hasOverridePermission) {
    throw new DomainError(
      'DISCOUNT_OVERRIDE_REQUIRED',
      `Discount above ${overridePercent}% requires sales:discount-override`,
    );
  }
}

export { Money };
