/** Oldest receipt first; expiry from the batch is informational for display and tie-breaks. */
export const BATCH_CONSUMPTION_ORDER = [
  { receivedAt: 'asc' as const },
  { expiresAt: { sort: 'asc' as const, nulls: 'last' as const } },
];
