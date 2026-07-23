import {
  getLastWorkspace,
  parseOrganizationRoute,
  setLastWorkspace,
  type LastWorkspace,
} from './workspace-context';

export type NavGroup = 'work' | 'catalog' | 'store' | 'org' | 'system';

export type NavItem = {
  href: string;
  label: string;
  permission?: string;
  orgScoped?: boolean;
  storeScoped?: boolean;
  /** Group for sidebar / command palette sections. */
  group: NavGroup;
};

export const NAV_GROUP_ORDER: NavGroup[] = ['work', 'catalog', 'store', 'org', 'system'];

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  work: 'Работа',
  catalog: 'Справочники',
  store: 'Магазин',
  org: 'Организация',
  system: 'Система',
};

export const PRIMARY_NAV: NavItem[] = [
  // Работа
  {
    href: '/',
    label: 'Обзор',
    group: 'work',
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/today',
    label: 'Сегодня',
    permission: 'workspace:read',
    storeScoped: true,
    group: 'work',
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/operations',
    label: 'Операции',
    permission: 'operations:read',
    storeScoped: true,
    group: 'work',
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/orders',
    label: 'Заказы',
    permission: 'orders:read',
    storeScoped: true,
    group: 'work',
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/deliveries',
    label: 'Доставка',
    permission: 'delivery:read',
    storeScoped: true,
    group: 'work',
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/sales',
    label: 'Продажи',
    permission: 'sales:read',
    storeScoped: true,
    group: 'work',
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/payments',
    label: 'Оплаты',
    permission: 'payments:read',
    storeScoped: true,
    group: 'work',
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/stock',
    label: 'Остатки',
    permission: 'inventory:read',
    storeScoped: true,
    group: 'work',
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/write-offs',
    label: 'Списания',
    permission: 'write-offs:read',
    storeScoped: true,
    group: 'work',
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/transfers',
    label: 'Перемещения',
    permission: 'transfers:read',
    storeScoped: true,
    group: 'work',
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/inventory-counts',
    label: 'Инвентаризации',
    permission: 'inventory-counts:read',
    storeScoped: true,
    group: 'work',
  },

  // Справочники
  {
    href: '/organizations/{orgId}/master-data',
    label: 'Справочники',
    permission: 'master-data:read',
    orgScoped: true,
    group: 'catalog',
  },

  // Магазин
  {
    href: '/organizations/{orgId}/stores/{storeId}/supplies',
    label: 'Поставки',
    permission: 'supply:read',
    storeScoped: true,
    group: 'store',
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/payment-methods',
    label: 'Способы оплаты',
    permission: 'payments:manage-methods',
    storeScoped: true,
    group: 'store',
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/cash-accounts',
    label: 'Касса',
    permission: 'payments:view-cash',
    storeScoped: true,
    group: 'store',
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/couriers',
    label: 'Курьеры',
    permission: 'delivery:read',
    storeScoped: true,
    group: 'store',
  },

  // Организация
  {
    href: '/organizations/{orgId}/customers',
    label: 'Клиенты',
    permission: 'customers:read',
    orgScoped: true,
    group: 'org',
  },
  {
    href: '/organizations/{orgId}/users',
    label: 'Пользователи',
    permission: 'users:read',
    orgScoped: true,
    group: 'org',
  },
  {
    href: '/organizations/{orgId}/roles',
    label: 'Роли',
    permission: 'roles:manage',
    orgScoped: true,
    group: 'org',
  },
  {
    href: '/organizations/{orgId}/audit',
    label: 'Аудит',
    permission: 'audit:read',
    orgScoped: true,
    group: 'org',
  },

  // Система
  {
    href: '/organizations',
    label: 'Организации',
    permission: 'organization:read',
    group: 'system',
  },
  { href: '/sessions', label: 'Сессии', group: 'system' },
];

/** Action shortcuts that resolve to PRIMARY_NAV routes (not a second nav source). */
export type NavActionShortcut = {
  id: string;
  label: string;
  /** Label of the PRIMARY_NAV item to open. */
  navLabel: string;
};

export const NAV_ACTION_SHORTCUTS: NavActionShortcut[] = [
  { id: 'new-order', label: 'Новый заказ', navLabel: 'Заказы' },
  { id: 'new-sale', label: 'Новая продажа', navLabel: 'Продажи' },
  { id: 'stock', label: 'Остатки', navLabel: 'Остатки' },
  { id: 'today', label: 'Сегодня', navLabel: 'Сегодня' },
  { id: 'write-off', label: 'Новое списание', navLabel: 'Списания' },
  { id: 'transfer', label: 'Новое перемещение', navLabel: 'Перемещения' },
  { id: 'inventory-count', label: 'Новая инвентаризация', navLabel: 'Инвентаризации' },
];

export const HOME_ROUTE_STORAGE_KEY = 'flower.homeRoute';

export type HomeRoutePreference = 'today' | 'operations';

export function getHomeRoutePreference(): HomeRoutePreference | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(HOME_ROUTE_STORAGE_KEY);
  return value === 'today' || value === 'operations' ? value : null;
}

export function resolveStoreHomePath(
  organizationId: string,
  storeId: string,
  hasPermission: (code: string) => boolean,
): string {
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const canWorkspace = hasPermission('workspace:read');
  const canOperations = hasPermission('operations:read');

  if (canWorkspace && !canOperations) {
    return `${base}/today`;
  }
  if (canOperations) {
    const preferred = getHomeRoutePreference();
    if (preferred === 'today' && canWorkspace) {
      return `${base}/today`;
    }
    if (preferred === 'operations') {
      return `${base}/operations`;
    }
    // Default director home: KPI dashboard (uses last store context).
    return '/';
  }
  if (canWorkspace) {
    return `${base}/today`;
  }
  return base;
}

export function parseStoreRoute(pathname: string): {
  organizationId: string | null;
  storeId: string | null;
} {
  const match = pathname.match(/\/organizations\/([^/]+)\/stores\/([^/]+)/);
  return {
    organizationId: match?.[1] ?? null,
    storeId: match?.[2] ?? null,
  };
}

/**
 * Resolve org/store for nav: URL store → last store (same org) → org from URL/auth/last.
 */
export function resolveNavWorkspace(
  pathname: string,
  authOrganizationId?: string | null,
): { organizationId: string | null; storeId: string | null; fromLastStore: boolean } {
  const route = parseStoreRoute(pathname);
  const pathOrg = parseOrganizationRoute(pathname);
  const last = getLastWorkspace();

  const organizationId =
    route.organizationId ?? authOrganizationId ?? pathOrg ?? last?.organizationId ?? null;

  if (route.storeId) {
    return { organizationId, storeId: route.storeId, fromLastStore: false };
  }

  if (
    organizationId &&
    last &&
    last.organizationId === organizationId &&
    last.storeId
  ) {
    return { organizationId, storeId: last.storeId, fromLastStore: true };
  }

  return { organizationId, storeId: null, fromLastStore: false };
}

export function rememberWorkspaceFromPath(
  pathname: string,
  storeName?: string,
): LastWorkspace | null {
  const route = parseStoreRoute(pathname);
  if (!route.organizationId || !route.storeId) return null;
  const workspace: LastWorkspace = {
    organizationId: route.organizationId,
    storeId: route.storeId,
    storeName,
  };
  setLastWorkspace(workspace);
  return workspace;
}

export function resolveNavHref(
  item: NavItem,
  organizationId?: string | null,
  storeId?: string | null,
): string | null {
  if (item.storeScoped) {
    if (!organizationId || !storeId) return null;
    return item.href.replace('{orgId}', organizationId).replace('{storeId}', storeId);
  }
  if (item.orgScoped) {
    if (!organizationId) return null;
    return item.href.replace('{orgId}', organizationId);
  }
  return item.href;
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  // Prefer exact/child match, but don't mark /organizations active for every nested page
  // when comparing against the system list entry — keep previous behavior for deep links.
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function filterNavByPermissions(
  items: NavItem[],
  hasPermission: (code: string) => boolean,
  organizationId?: string | null,
  storeId?: string | null,
): Array<NavItem & { href: string }> {
  return items
    .filter((item) => !item.permission || hasPermission(item.permission))
    .map((item) => {
      const href = resolveNavHref(item, organizationId, storeId);
      return href ? { ...item, href } : null;
    })
    .filter((item): item is NavItem & { href: string } => item !== null);
}

/** Items the user could see if store context were present (for empty-state hints). */
export function countStoreScopedEligible(
  items: NavItem[],
  hasPermission: (code: string) => boolean,
  group?: NavGroup,
): number {
  return items.filter(
    (item) =>
      item.storeScoped &&
      (!group || item.group === group) &&
      (!item.permission || hasPermission(item.permission)),
  ).length;
}

/** Map action shortcuts onto resolved PRIMARY_NAV hrefs (New sale → /sales/new). */
export function resolveNavActionShortcuts(
  navItems: Array<NavItem & { href: string }>,
): Array<{ id: string; label: string; href: string }> {
  return NAV_ACTION_SHORTCUTS.flatMap((shortcut) => {
    const nav = navItems.find((item) => item.label === shortcut.navLabel);
    if (!nav) return [];
    let href = nav.href;
    if (shortcut.id === 'new-sale') {
      href = `${nav.href.replace(/\/$/, '')}/new`;
    }
    return [{ id: shortcut.id, label: shortcut.label, href }];
  });
}
