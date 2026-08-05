/** Normalize locale decimal input: trim, drop spaces, comma → dot. */
export function normalizeDecimalString(raw: string): string {
  return raw.trim().replace(/\u00A0/g, '').replace(/\s/g, '').replace(',', '.');
}
