export const REFRESH_COOKIE_NAME = 'flower_refresh_token';

export const SECURITY_AUDIT_ACTIONS = {
  LOGIN_SUCCEEDED: 'LOGIN_SUCCEEDED',
  LOGIN_FAILED: 'LOGIN_FAILED',
  USER_LOCKED: 'USER_LOCKED',
  SESSION_REFRESHED: 'SESSION_REFRESHED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  LOGOUT: 'LOGOUT',
  LOGOUT_ALL: 'LOGOUT_ALL',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
} as const;

export const GENERIC_AUTH_FAILURE = {
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid login or password',
} as const;

export function assertOriginAllowed(origin: string | undefined, allowedOrigins: readonly string[]): void {
  if (!origin) return;
  if (!allowedOrigins.includes(origin)) {
    throw new Error('Origin not allowed');
  }
}
