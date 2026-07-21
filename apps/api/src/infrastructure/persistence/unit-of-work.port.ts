/**
 * Unit of Work / transaction boundary for application services.
 * Domain layer depends on this port — not on Prisma.
 *
 * Nested transactions: not supported. Calling runInTransaction while already
 * inside a transaction throws NestedTransactionError (see Prisma adapter).
 */
export interface UnitOfWork {
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
