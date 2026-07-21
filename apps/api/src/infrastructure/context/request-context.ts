import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestId } from '@flower/contracts';

export type StoreAccessMode = 'ALL_STORES' | 'SELECTED_STORES';

export type StoreScope = {
  mode: StoreAccessMode;
  storeIds: readonly string[];
};

export type AuthContext = {
  userId: string;
  membershipId: string;
  organizationId: string;
  sessionId: string;
  permissions: readonly string[];
  storeScope: StoreScope;
};

export type RequestContextStore = {
  requestId: RequestId;
  actorId: string | null;
  organizationId: string | null;
  auth: AuthContext | null;
};

export const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export function getRequestContext(): RequestContextStore | undefined {
  return requestContextStorage.getStore();
}

export function requireRequestId(): RequestId {
  return getRequestContext()?.requestId ?? 'unknown';
}

export function getAuthContext(): AuthContext | null {
  return getRequestContext()?.auth ?? null;
}

export function requireAuthContext(): AuthContext {
  const auth = getAuthContext();
  if (!auth) {
    throw new Error('AuthContext is required but missing');
  }
  return auth;
}
