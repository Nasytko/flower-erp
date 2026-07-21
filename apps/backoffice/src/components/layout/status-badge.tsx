type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'accent';

const toneByStatus: Record<string, StatusTone> = {
  ACTIVE: 'success',
  active: 'success',
  DEFAULT: 'success',
  ok: 'success',
  ready: 'success',
  READY: 'success',
  COMPLETED: 'success',
  ANNULLED: 'danger',
  RESERVED: 'info',
  PARTIALLY_RESERVED: 'warning',
  IN_PREPARATION: 'accent',
  CONFIRMED: 'warning',
  DRAFT: 'warning',
  draft: 'warning',
  CANCELLED: 'danger',
  OVERDUE: 'danger',
  DEFICIT: 'danger',
  UNASSIGNED: 'warning',

  FLOWER: 'success',
  MATERIAL: 'neutral',
  LOT: 'warning',
  NONE: 'neutral',
  ARCHIVED: 'neutral',
  archived: 'neutral',
  WAREHOUSE: 'neutral',
  INACTIVE: 'warning',
  POSTED: 'success',
  SUBMITTED_TO_SUPPLIER: 'info',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',

  READY_FOR_DISPATCH: 'info',
  ASSIGNED: 'accent',
  IN_TRANSIT: 'info',
  DELIVERED: 'success',
  PROBLEM: 'danger',
  PLANNED: 'warning',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = toneByStatus[status] ?? 'neutral';
  return <span className={`status-badge status-badge--${tone}`}>{status}</span>;
}
