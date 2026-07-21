export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

declare const brand: unique symbol;

export type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand };

export function brandId<TBrand extends string>(value: string): Brand<string, TBrand> {
  return value as Brand<string, TBrand>;
}

export type OrganizationId = Brand<string, 'OrganizationId'>;
export type StoreId = Brand<string, 'StoreId'>;
export type WarehouseId = Brand<string, 'WarehouseId'>;
export type ActorId = Brand<string, 'ActorId'>;

export interface ClockPort {
  now(): Date;
}

export type DateRange = {
  readonly from: Date;
  readonly to: Date;
};

export function isValidDateRange(range: DateRange): boolean {
  return range.from.getTime() <= range.to.getTime();
}

export { Money, DEFAULT_CURRENCY, MONEY_SCALE, type MoneyInput } from './money.js';

export const CLOCK_PORT = Symbol('CLOCK_PORT');
