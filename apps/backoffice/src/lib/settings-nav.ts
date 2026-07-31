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

export type MasterDataSection = {
  slug: string;
  title: string;
  description: string;
  permission: string;
};

/** Permission gate for the entire settings area (director-only). */
export const SETTINGS_ACCESS_PERMISSION = 'users:read';

export const MASTER_DATA_SECTIONS: MasterDataSection[] = [
  {
    slug: 'items',
    title: 'Товары',
    description: 'Цветы, материалы и готовые букеты',
    permission: 'master-data:read',
  },
  {
    slug: 'categories',
    title: 'Категории',
    description: 'Дерево категорий без ограничения глубины',
    permission: 'master-data:read',
  },
  {
    slug: 'suppliers',
    title: 'Поставщики',
    description: 'Поставщики организации',
    permission: 'master-data:read',
  },
  {
    slug: 'policies',
    title: 'Политики учёта',
    description: 'Метод учёта и срок годности по умолчанию',
    permission: 'master-data:read',
  },
  {
    slug: 'retail-prices',
    title: 'Розничные цены',
    description: 'Цветы за штуку, материалы — по неделям',
    permission: 'master-data:manage',
  },
];

export const SETTINGS_NAV_CATEGORIES: SettingsNavCategory[] = [
  {
    id: 'organization',
    label: 'Организация',
    items: [
      {
        href: '/organizations/{orgId}',
        label: 'Магазины',
        description: 'Список магазинов и создание новых точек',
        permission: 'organization:read',
        storeScoped: false,
      },
      {
        href: '/organizations/{orgId}/integrations',
        label: 'Карты и навигация',
        description: 'Яндекс.Карты, геокодирование, центр карты',
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
        description: 'Учётные записи, роли и доступ к магазинам',
        permission: 'users:read',
      },
      {
        href: '/organizations/{orgId}/roles',
        label: 'Роли и права',
        description: 'Справочник системных ролей (назначение — в «Сотрудники»)',
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
        label: 'Справочники',
        description: 'Товары, категории, поставщики, политики, цены',
        permission: 'master-data:read',
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
        description: 'Каталог методов оплаты',
        permission: 'payments:manage-methods',
        storeScoped: true,
      },
      {
        href: '/organizations/{orgId}/stores/{storeId}/couriers',
        label: 'Курьеры',
        description: 'Профили курьеров для доставок',
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

export function settingsHubHref(organizationId: string): string {
  return `/organizations/${organizationId}/settings`;
}

export function settingsBreadcrumbs(
  organizationId: string,
  ...trail: Array<{ label: string; href?: string }>
) {
  return [
    { label: 'Организации', href: '/organizations' },
    { label: 'Настройки', href: settingsHubHref(organizationId) },
    ...trail,
  ];
}

export function masterDataBreadcrumbs(
  organizationId: string,
  ...trail: Array<{ label: string; href?: string }>
) {
  const base = `/organizations/${organizationId}/master-data`;
  return settingsBreadcrumbs(organizationId, { label: 'Справочники', href: base }, ...trail);
}

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
  if (href.endsWith('/master-data')) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
