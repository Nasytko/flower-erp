/** Persist last organization/store so ops nav survives admin routes. */

export const LAST_ORGANIZATION_ID_KEY = 'flower.lastOrganizationId';
export const LAST_STORE_ID_KEY = 'flower.lastStoreId';
export const LAST_STORE_NAME_KEY = 'flower.lastStoreName';

export type LastWorkspace = {
  organizationId: string;
  storeId: string;
  storeName?: string;
};

export function getLastWorkspace(): LastWorkspace | null {
  if (typeof window === 'undefined') return null;
  const organizationId = window.localStorage.getItem(LAST_ORGANIZATION_ID_KEY);
  const storeId = window.localStorage.getItem(LAST_STORE_ID_KEY);
  if (!organizationId || !storeId) return null;
  const storeName = window.localStorage.getItem(LAST_STORE_NAME_KEY) ?? undefined;
  return { organizationId, storeId, storeName: storeName || undefined };
}

export function setLastWorkspace(workspace: LastWorkspace): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAST_ORGANIZATION_ID_KEY, workspace.organizationId);
  window.localStorage.setItem(LAST_STORE_ID_KEY, workspace.storeId);
  if (workspace.storeName) {
    window.localStorage.setItem(LAST_STORE_NAME_KEY, workspace.storeName);
  }
}

export function clearLastWorkspace(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LAST_ORGANIZATION_ID_KEY);
  window.localStorage.removeItem(LAST_STORE_ID_KEY);
  window.localStorage.removeItem(LAST_STORE_NAME_KEY);
}

export function parseOrganizationRoute(pathname: string): string | null {
  const match = pathname.match(/\/organizations\/([^/]+)/);
  return match?.[1] ?? null;
}
