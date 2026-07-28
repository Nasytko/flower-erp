import {
  orderDisplayPhaseLabel,
  resolveOrderDisplayPhase,
} from '../../orders/domain/order-display-phase';

export type UrgencyLevel = 'NORMAL' | 'SOON' | 'URGENT' | 'OVERDUE';

export type WorkspacePrimaryAction =
  | 'CLAIM'
  | 'RESERVE'
  | 'START_PREPARATION'
  | 'EDIT_ACTUAL'
  | 'MARK_READY'
  | 'CREATE_SALE'
  | 'VIEW'
  | 'NONE';

export type WorkspaceOrderCard = {
  id: string;
  number: string;
  status: string;
  readyAt: Date | null;
  type: string;
  occasion: string;
  customerNameSnapshot: string | null;
  assignedFloristId: string | null;
  hasActiveAssignment: boolean;
  hasDeficit: boolean;
  version: number;
  urgency: UrgencyLevel;
  primaryAction: WorkspacePrimaryAction;
  priority: number;
  displayPhase: string;
  displayPhaseLabel: string;
};

/**
 * Urgency from readyAt relative to server now.
 * OVERDUE: past readyAt; URGENT: within half of soon window; SOON: within soonMinutes; else NORMAL.
 */
export function computeUrgency(
  readyAt: Date | null,
  now: Date,
  soonMinutes: number,
): UrgencyLevel {
  if (!readyAt) return 'NORMAL';
  const ms = readyAt.getTime() - now.getTime();
  if (ms < 0) return 'OVERDUE';
  const soonMs = soonMinutes * 60_000;
  if (ms <= soonMs / 2) return 'URGENT';
  if (ms <= soonMs) return 'SOON';
  return 'NORMAL';
}

/** Lower number = higher display priority (matches claim-next buckets). */
export function workspacePriority(
  status: string,
  readyAt: Date | null,
  now: Date,
  soonMinutes: number,
): number {
  const urgency = computeUrgency(readyAt, now, soonMinutes);
  if (urgency === 'OVERDUE') return 0;
  if (urgency === 'URGENT' || urgency === 'SOON') return 1;
  if (status === 'IN_PREPARATION') return 2;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (readyAt && readyAt >= start && readyAt <= end) return 3;
  return 4;
}

export function compareWorkspacePriority(a: WorkspaceOrderCard, b: WorkspaceOrderCard): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const aReady = a.readyAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const bReady = b.readyAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (aReady !== bReady) return aReady - bReady;
  return a.number.localeCompare(b.number);
}

/**
 * Suggested primary CTA for florist workspace cards / work order.
 * Domain projection only — commands stay in Orders/Sales modules.
 */
export function resolvePrimaryAction(input: {
  status: string;
  hasActiveAssignment: boolean;
  assignedToCurrentUser: boolean;
  hasActiveSale: boolean;
  hasDeficit?: boolean;
}): WorkspacePrimaryAction {
  const { status, hasActiveAssignment, assignedToCurrentUser, hasActiveSale, hasDeficit } = input;
  if (status === 'CANCELLED' || status === 'COMPLETED' || status === 'DRAFT') {
    return 'VIEW';
  }
  if (status === 'READY') {
    return hasActiveSale ? 'VIEW' : 'CREATE_SALE';
  }
  if (status === 'CONFIRMED' || (status === 'PARTIALLY_RESERVED' && hasDeficit)) {
    return 'RESERVE';
  }
  if (!hasActiveAssignment) {
    return 'CLAIM';
  }
  if (!assignedToCurrentUser) {
    return 'VIEW';
  }
  if (status === 'RESERVED' || status === 'PARTIALLY_RESERVED') {
    return 'START_PREPARATION';
  }
  if (status === 'IN_PREPARATION') {
    return 'MARK_READY';
  }
  return 'NONE';
}

export function enrichWorkspaceCard(
  row: Omit<
    WorkspaceOrderCard,
    'urgency' | 'primaryAction' | 'priority' | 'displayPhase' | 'displayPhaseLabel'
  >,
  now: Date,
  soonMinutes: number,
  currentMembershipId: string | null,
  hasActiveSale = false,
): WorkspaceOrderCard {
  const urgency = computeUrgency(row.readyAt, now, soonMinutes);
  const priority = workspacePriority(row.status, row.readyAt, now, soonMinutes);
  const primaryAction = resolvePrimaryAction({
    status: row.status,
    hasActiveAssignment: row.hasActiveAssignment,
    assignedToCurrentUser:
      Boolean(currentMembershipId) && row.assignedFloristId === currentMembershipId,
    hasActiveSale,
    hasDeficit: row.hasDeficit,
  });
  const displayPhase = resolveOrderDisplayPhase({
    status: row.status,
    type: row.type,
    hasActiveAssignment: row.hasActiveAssignment,
  });
  return {
    ...row,
    urgency,
    priority,
    primaryAction,
    displayPhase,
    displayPhaseLabel: orderDisplayPhaseLabel(displayPhase, { type: row.type }),
  };
}
