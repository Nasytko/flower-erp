import { Prisma } from '@prisma/client';
import { normalizeDecimalString } from '@flower/shared-kernel';

export function parsePrismaDecimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(normalizeDecimalString(value));
}
