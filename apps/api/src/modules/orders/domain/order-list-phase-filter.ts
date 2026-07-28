import type { Prisma } from '@prisma/client';
import type { OrderDisplayPhase } from './order-display-phase';

export type OrderListPhaseFilter = OrderDisplayPhase | 'HANDED_OFF_TODAY';

function dayStart(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayEnd(now: Date): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Maps UI order phase to Prisma where (store/org applied separately). */
export function buildOrderListPhaseWhere(input: {
  phase: OrderListPhaseFilter;
  now: Date;
  /** Orders with DELIVERED delivery (any day) — for READY/HANDED_OFF split. */
  deliveredOrderIds?: string[];
  /** Orders with DELIVERED delivery today — for HANDED_OFF_TODAY. */
  deliveredTodayOrderIds?: string[];
}): Prisma.OrderWhereInput {
  const start = dayStart(input.now);
  const end = dayEnd(input.now);
  const delivered = input.deliveredOrderIds ?? [];
  const deliveredToday = input.deliveredTodayOrderIds ?? [];

  switch (input.phase) {
    case 'NEW':
      return {
        status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED'] },
        assignments: { none: { releasedAt: null } },
      };
    case 'IN_WORK':
      return {
        OR: [
          { status: 'IN_PREPARATION' },
          {
            status: { in: ['CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED'] },
            assignments: { some: { releasedAt: null } },
          },
        ],
      };
    case 'READY':
      return {
        status: 'READY',
        ...(delivered.length > 0 ? { id: { notIn: delivered } } : {}),
      };
    case 'HANDED_OFF':
      return {
        OR: [
          { status: 'COMPLETED' },
          ...(delivered.length > 0 ? [{ id: { in: delivered } }] : []),
        ],
      };
    case 'HANDED_OFF_TODAY':
      return {
        OR: [
          { status: 'COMPLETED', completedAt: { gte: start, lte: end } },
          ...(deliveredToday.length > 0 ? [{ id: { in: deliveredToday } }] : []),
        ],
      };
    default:
      return {};
  }
}
