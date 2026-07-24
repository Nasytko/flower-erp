import {
  getLastWorkspace,
  parseOrganizationRoute,
  setLastWorkspace,
  type LastWorkspace,
} from './workspace-context';

export type NavItem = {
  href: string;
  label: string;
  permission?: string;
  orgScoped?: boolean;
  storeScoped?: boolean;
};

/**
 * Flat primary navigation (iteration 1 IA).
 * Order is product-defined; do not reintroduce parallel top-level items for hub children.
 */
export const PRIMARY_NAV: NavItem[] = [
  {
    href: '/organizations/{orgId}/stores/{storeId}/today',
    label: 'Сегодня',
    permission: 'workspace:read',
    storeScoped: true,
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/orders',
    label: 'Заказы',
    permission: 'orders:read',
    storeScoped: true,
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/sales',
    label: 'Продажи',
    permission: 'sales:read',
    storeScoped: true,
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/stock',
    label: 'Склад',
    permission: 'inventory:read',
    storeScoped: true,
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/supplies',
    label: 'Поставки',
    permission: 'supply:read',
    storeScoped: true,
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/deliveries',
    label: 'Доставка',
    permission: 'delivery:read',
    storeScoped: true,
  },
  {
    href: '/organizations/{orgId}/stores/{storeId}/payments',
    label: 'Финансы',
    permission: 'payments:read',
    storeScoped: true,
  },
  {
    href: '/organizations/{orgId}/master-data',
    label: 'Справочники',
    permission: 'master-data:read',
    orgScoped: true,
  },
  {
    href: '/organizations/{orgId}/users',
    label: 'Настройки',
    permission: 'users:read',
    orgScoped: true,
  },
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
  { id: 'stock', label: 'Склад', navLabel: 'Склад' },
  { id: 'today', label: 'Сегодня', navLabel: 'Сегодня' },
];

/**
 * Post-login / store home:
 * - workspace:read (director, florist) → Сегодня
 * - delivery:read without workspace (courier) → Доставка
 * - otherwise store base (rare fallback)
 */
export function resolveStoreHomePath(
  organizationId: string,
  storeId: string,
  hasPermission: (code: string) => boolean,
): string {
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  if (hasPermission('workspace:read')) {
    return `${base}/today`;
  }
  if (hasPermission('delivery:read')) {
    return `${base}/deliveries`;
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

  if (organizationId && last && last.organizationId === organizationId && last.storeId) {
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
): number {
  return items.filter(
    (item) => item.storeScoped && (!item.permission || hasPermission(item.permission)),
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
