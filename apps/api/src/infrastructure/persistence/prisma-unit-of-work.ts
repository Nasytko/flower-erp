import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UnitOfWork } from './unit-of-work.port';
import {
  NestedTransactionError,
  getActivePrismaTx,
  runWithPrismaTransaction,
} from './prisma-transaction-context';

@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (getActivePrismaTx()) {
      throw new NestedTransactionError();
    }

    return this.prisma.$transaction(async (tx) => runWithPrismaTransaction(tx, work));
  }
}
