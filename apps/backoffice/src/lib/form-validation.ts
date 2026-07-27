export type FieldErrors = Record<string, string | undefined>;

export function requiredText(value: string, message: string): string | undefined {
  return value.trim() ? undefined : message;
}

export function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export function firstFieldError(errors: FieldErrors): string | null {
  for (const message of Object.values(errors)) {
    if (message) return message;
  }
  return null;
}
