import Decimal from 'decimal.js';

/** Default currency for v1 Flower ERP. */
export const DEFAULT_CURRENCY = 'BYN';

/** BYN display/settle scale. */
export const MONEY_SCALE = 2;

Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

export type MoneyInput = string | number | Money | Decimal;

/**
 * Immutable money amount backed by decimal.js.
 * Prefer constructing from decimal strings at API boundaries.
 * Do not use JavaScript number arithmetic for financial calculations.
 */
export class Money {
  private readonly value: Decimal;
  readonly currency: string;

  constructor(input: MoneyInput, currency: string = DEFAULT_CURRENCY) {
    this.currency = currency;
    if (input instanceof Money) {
      this.value = input.value;
      this.currency = input.currency;
      return;
    }
    if (input instanceof Decimal) {
      this.value = input;
      return;
    }
    try {
      this.value = new Decimal(input);
    } catch {
      throw new Error(`Invalid money value: ${String(input)}`);
    }
    if (!this.value.isFinite()) {
      throw new Error(`Invalid money value: ${String(input)}`);
    }
  }

  static zero(currency: string = DEFAULT_CURRENCY): Money {
    return new Money(0, currency);
  }

  static fromString(value: string, currency: string = DEFAULT_CURRENCY): Money {
    return new Money(value, currency);
  }

  private ensureSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  private wrap(d: Decimal): Money {
    return new Money(d, this.currency);
  }

  plus(other: MoneyInput): Money {
    const o = other instanceof Money ? other : new Money(other, this.currency);
    this.ensureSameCurrency(o);
    return this.wrap(this.value.plus(o.value));
  }

  minus(other: MoneyInput): Money {
    const o = other instanceof Money ? other : new Money(other, this.currency);
    this.ensureSameCurrency(o);
    return this.wrap(this.value.minus(o.value));
  }

  mul(other: MoneyInput): Money {
    const o = other instanceof Money ? other : new Money(other);
    return this.wrap(this.value.mul(o.value));
  }

  div(other: MoneyInput): Money {
    const o = other instanceof Money ? other : new Money(other);
    if (o.value.isZero()) {
      throw new Error('Division by zero');
    }
    return this.wrap(this.value.div(o.value));
  }

  lt(other: MoneyInput): boolean {
    const o = other instanceof Money ? other : new Money(other, this.currency);
    return this.value.lt(o.value);
  }

  lte(other: MoneyInput): boolean {
    const o = other instanceof Money ? other : new Money(other, this.currency);
    return this.value.lte(o.value);
  }

  gt(other: MoneyInput): boolean {
    const o = other instanceof Money ? other : new Money(other, this.currency);
    return this.value.gt(o.value);
  }

  gte(other: MoneyInput): boolean {
    const o = other instanceof Money ? other : new Money(other, this.currency);
    return this.value.gte(o.value);
  }

  eq(other: MoneyInput): boolean {
    const o = other instanceof Money ? other : new Money(other, this.currency);
    return this.value.eq(o.value);
  }

  isPositive(): boolean {
    return this.value.gt(0);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.lt(0);
  }

  static min(a: Money, b: Money): Money {
    a.ensureSameCurrency(b);
    return a.value.lte(b.value) ? a : b;
  }

  static max(a: Money, b: Money): Money {
    a.ensureSameCurrency(b);
    return a.value.gte(b.value) ? a : b;
  }

  /** Round to currency scale (default BYN = 2). */
  round(scale: number = MONEY_SCALE): Money {
    return this.wrap(this.value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP));
  }

  toFixed(digits: number = MONEY_SCALE): string {
    return this.value.toFixed(digits, Decimal.ROUND_HALF_UP);
  }

  /** API / persistence string form. */
  toString(): string {
    return this.toFixed(MONEY_SCALE);
  }

  toDecimal(): Decimal {
    return this.value;
  }
}
