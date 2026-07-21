import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, PrismaClient } from '@prisma/client';

export type PrismaTransactionClient = Prisma.TransactionClient;

const prismaTxStorage = new AsyncLocalStorage<PrismaTransactionClient>();

export class NestedTransactionError extends Error {
  constructor() {
    super('Nested database transactions are not supported');
    this.name = 'NestedTransactionError';
  }
}

export function getActivePrismaTx(): PrismaTransactionClient | undefined {
  return prismaTxStorage.getStore();
}

/**
 * Returns the transactional client when inside UnitOfWork, otherwise the root client.
 * Repositories MUST use this helper instead of the injected PrismaService directly
 * for all reads/writes that participate in business transactions.
 */
export function resolvePrismaClient(
  root: PrismaClient,
): PrismaClient | PrismaTransactionClient {
  return getActivePrismaTx() ?? root;
}

export async function runWithPrismaTransaction<T>(
  tx: PrismaTransactionClient,
  work: () => Promise<T>,
): Promise<T> {
  if (getActivePrismaTx()) {
    throw new NestedTransactionError();
  }
  return prismaTxStorage.run(tx, work);
}
