/**
 * Settings area — director-only configuration hub with expandable subcategories.
 */

export type SettingsNavItem = {
  href: string;
  label: string;
  description?: string;
  permission?: string;
  anyPermission?: string[];
  storeScoped?: boolean;
};

export type SettingsNavCategory = {
  id: string;
  label: string;
  items: SettingsNavItem[];
};

/** Permission gate for the entire settings area (director-only). */
export const SETTINGS_ACCESS_PERMISSION = 'users:read';

export const SETTINGS_NAV_CATEGORIES: SettingsNavCategory[] = [
  {
    id: 'organization',
    label: 'Организация',
    items: [
      {
        href: '/organizations/{orgId}',
        label: 'Магазины',
        description: 'Список магазинов, создание новых точек',
        permission: 'organization:read',
        storeScoped: false,
      },
      {
        href: '/organizations/{orgId}/integrations',
        label: 'Карты и навигация',
        description: 'Яндекс.Карты, геокодирование',
        permission: 'organization:manage',
      },
    ],
  },
  {
    id: 'people',
    label: 'Люди и доступ',
    items: [
      {
        href: '/organizations/{orgId}/users',
        label: 'Сотрудники',
        description: 'Учётные записи, роли, доступ к магазинам',
        permission: 'users:read',
      },
      {
        href: '/organizations/{orgId}/roles',
        label: 'Роли',
        description: 'Назначение ролей и прав',
        permission: 'roles:manage',
      },
    ],
  },
  {
    id: 'master-data',
    label: 'Справочники',
    items: [
      {
        href: '/organizations/{orgId}/master-data',
        label: 'Обзор справочников',
        description: 'Товары, категории, поставщики, политики',
        permission: 'master-data:read',
      },
      {
        href: '/organizations/{orgId}/master-data/items',
        label: 'Товары',
        permission: 'master-data:read',
      },
      {
        href: '/organizations/{orgId}/master-data/categories',
        label: 'Категории',
        permission: 'master-data:read',
      },
      {
        href: '/organizations/{orgId}/master-data/suppliers',
        label: 'Поставщики',
        permission: 'master-data:read',
      },
      {
        href: '/organizations/{orgId}/master-data/policies',
        label: 'Политики учёта',
        permission: 'master-data:read',
      },
      {
        href: '/organizations/{orgId}/master-data/retail-prices',
        label: 'Розничные цены',
        permission: 'master-data:manage',
      },
    ],
  },
  {
    id: 'store',
    label: 'Магазин',
    items: [
      {
        href: '/organizations/{orgId}/stores/{storeId}/settings',
        label: 'Магазин и склад',
        description: 'Название, адрес, часовой пояс, склад',
        permission: 'stores:create',
        storeScoped: true,
      },
      {
        href: '/organizations/{orgId}/stores/{storeId}/payment-methods',
        label: 'Способы оплаты',
        permission: 'payments:manage-methods',
        storeScoped: true,
      },
      {
        href: '/organizations/{orgId}/stores/{storeId}/couriers',
        label: 'Курьеры',
        permission: 'delivery:manage-couriers',
        storeScoped: true,
      },
    ],
  },
  {
    id: 'system',
    label: 'Система',
    items: [
      {
        href: '/organizations/{orgId}/audit',
        label: 'Журнал действий',
        description: 'Аудит изменений в системе',
        permission: 'audit:read',
      },
    ],
  },
];

const SETTINGS_PATH_PATTERNS = [
  /^\/organizations\/[^/]+\/settings(\/|$)/,
  /^\/organizations\/[^/]+\/users(\/|$)/,
  /^\/organizations\/[^/]+\/roles(\/|$)/,
  /^\/organizations\/[^/]+\/audit(\/|$)/,
  /^\/organizations\/[^/]+\/integrations(\/|$)/,
  /^\/organizations\/[^/]+\/master-data(\/|$)/,
  /^\/organizations\/[^/]+\/stores\/[^/]+\/settings(\/|$)/,
  /^\/organizations\/[^/]+\/stores\/[^/]+\/payment-methods(\/|$)/,
  /^\/organizations\/[^/]+\/stores\/[^/]+\/couriers(\/|$)/,
  /^\/organizations\/[^/]+$/,
];

export function isSettingsAreaPath(pathname: string): boolean {
  return SETTINGS_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

function itemAllowed(item: SettingsNavItem, hasPermission: (code: string) => boolean): boolean {
  if (item.anyPermission?.length) {
    return item.anyPermission.some((code) => hasPermission(code));
  }
  if (item.permission) {
    return hasPermission(item.permission);
  }
  return true;
}

export function resolveSettingsHref(
  item: SettingsNavItem,
  organizationId: string,
  storeId?: string | null,
): string | null {
  if (item.storeScoped && !storeId) return null;
  return item.href
    .replace('{orgId}', organizationId)
    .replace('{storeId}', storeId ?? '');
}

export function filterSettingsNav(
  hasPermission: (code: string) => boolean,
  organizationId: string,
  storeId?: string | null,
): Array<SettingsNavCategory & { items: Array<SettingsNavItem & { href: string }> }> {
  return SETTINGS_NAV_CATEGORIES.map((category) => ({
    ...category,
    items: category.items
      .filter((item) => itemAllowed(item, hasPermission))
      .map((item) => {
        const href = resolveSettingsHref(item, organizationId, storeId);
        return href ? { ...item, href } : null;
      })
      .filter((item): item is SettingsNavItem & { href: string } => item !== null),
  })).filter((category) => category.items.length > 0);
}

export function isSettingsNavItemActive(pathname: string, href: string): boolean {
  if (href.match(/\/organizations\/[^/]+$/)) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
