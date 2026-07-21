export type UserStatus = 'ACTIVE' | 'BLOCKED' | 'ARCHIVED';
export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type StoreAccessMode = 'ALL_STORES' | 'SELECTED_STORES';

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

export function assertLogin(login: string): void {
  const normalized = normalizeLogin(login);
  if (!LOGIN_PATTERN.test(normalized)) {
    throw new DomainError('INVALID_LOGIN', 'Login must be 3–64 lowercase alphanumeric characters');
  }
}

export function assertPasswordPolicy(password: string): void {
  if (password.length < 10) {
    throw new DomainError('WEAK_PASSWORD', 'Password must be at least 10 characters');
  }
}

export function assertUserCanAuthenticate(status: UserStatus, lockedUntil: Date | null, now: Date): void {
  if (status === 'BLOCKED' || status === 'ARCHIVED') {
    throw new DomainError('USER_INACTIVE', 'User account is not active');
  }
  if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
    throw new DomainError('USER_LOCKED', 'User account is temporarily locked');
  }
}

export function assertMembershipActive(status: MembershipStatus): void {
  if (status !== 'ACTIVE') {
    throw new DomainError('MEMBERSHIP_INACTIVE', 'Organization membership is not active');
  }
}

export function assertStoreInScope(
  storeScope: { mode: StoreAccessMode; storeIds: readonly string[] },
  storeId: string,
): void {
  if (storeScope.mode === 'ALL_STORES') return;
  if (!storeScope.storeIds.includes(storeId)) {
    throw new DomainError('STORE_ACCESS_DENIED', 'Store is outside user scope');
  }
}

export function computeLockUntil(
  failedAttempts: number,
  maxAttempts: number,
  lockoutMinutes: number,
  now: Date,
): Date | null {
  if (failedAttempts < maxAttempts) return null;
  return new Date(now.getTime() + lockoutMinutes * 60_000);
}
