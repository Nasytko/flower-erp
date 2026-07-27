export const ATTENTION_SEVERITY_LABELS_RU: Record<string, string> = {
  CRITICAL: 'Критично',
  WARNING: 'Внимание',
  INFO: 'Инфо',
};

/** Human-readable age for attention cards (minutes from API). */
export function formatAttentionAge(minutes: number): string {
  if (minutes < 1) return 'сейчас';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  return `${days} дн`;
}

type AttentionLinkItem = {
  entityType: string;
  entityId: string;
  filterLink?: string | null;
  code?: string;
};

export function resolveAttentionHref(
  base: string,
  item: AttentionLinkItem,
  filterHref?: (filter: string) => string,
): string | null {
  const type = item.entityType.toUpperCase();
  if (type === 'ORDER') return `${base}/work-orders/${item.entityId}`;
  if (type === 'SALE') return `${base}/sales/${item.entityId}`;
  if (type === 'DELIVERY') return `${base}/deliveries/${item.entityId}`;
  if (item.code === 'LOW_STOCK' || item.code?.includes('STOCK')) {
    return `${base}/stock`;
  }
  if (item.filterLink === 'partially_reserved') return `${base}/stock`;
  if (item.filterLink && filterHref) return filterHref(item.filterLink);
  if (item.filterLink) {
    return `${base}/orders?filter=${encodeURIComponent(item.filterLink)}`;
  }
  if (item.code === 'SUPPLIES_AWAITING_RECEIPT') return `${base}/supplies`;
  if (item.code === 'DRAFT_PAYMENTS') return `${base}/payments`;
  return null;
}
