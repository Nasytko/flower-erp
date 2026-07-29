export function formatMoney(value: string | null | undefined, suffix = 'BYN'): string {
  if (value == null || value === '') return '—';
  return `${value} ${suffix}`;
}

export function formatQuantity(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}
