/**
 * ERP settings — split into org-wide admin, store admin, operational catalog, and user account.
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

export type CatalogSection = {
  slug: string;
  title: string;
  description: string;
  permission: string;
};

/** Org ERP settings hub — directors / platform admins only. */
export const ORG_SETTINGS_ACCESS_PERMISSION = 'users:read';

/** Store settings — store profile and payment methods. */
export const STORE_SETTINGS_ACCESS_ANY = ['stores:create', 'payments:manage-methods'] as const;

/** Operational catalog (flowers, suppliers) — staff with read access. */
export const CATALOG_ACCESS_PERMISSION = 'master-data:read';

/** Full catalog admin (policies, retail prices). */
export const CATALOG_ADMIN_PERMISSION = 'master-data:manage';

/** @deprecated Use ORG_SETTINGS_ACCESS_PERMISSION */
export const SETTINGS_ACCESS_PERMISSION = ORG_SETTINGS_ACCESS_PERMISSION;

/** Operational sections — florist / courier / director. */
export const CATALOG_SECTIONS: CatalogSection[] = [
  {
    slug: 'items',
    title: 'Товары',
    description: 'Цветы и материалы для закупок и сборки (ингредиенты)',
    permission: 'master-data:read',
  },
  {
    slug: 'suppliers',
    title: 'Поставщики',
    description: 'Поставщики цветов и материалов',
    permission: 'master-data:read',
  },
  {
    slug: 'categories',
    title: 'Категории',
    description: 'Группы товаров в справочнике',
    permission: 'master-data:read',
  },
  {
    slug: 'showcase-bouquets',
    title: 'Букеты на витрине',
    description: 'Готовые рецепты для заказов «Букет с витрины»',
    permission: 'master-data:read',
  },
];

/** Director-only catalog administration. */
export const CATALOG_ADMIN_SECTIONS: CatalogSection[] = [
  {
    slug: 'policies',
    title: 'Учёт по партиям',
    description: 'Шаблон срока годности при приёмке',
    permission: 'master-data:manage',
  },
  {
    slug: 'retail-prices',
    title: 'Розничные цены',
    description: 'Цветы за штуку, материалы — по неделям',
    permission: 'master-data:manage',
  },
];

/** @deprecated Use CATALOG_SECTIONS */
export const MASTER_DATA_SECTIONS = [...CATALOG_SECTIONS, ...CATALOG_ADMIN_SECTIONS];

export const ORG_SETTINGS_NAV_CATEGORIES: SettingsNavCategory[] = [
  {
    id: 'organization',
    label: 'Организация',
    items: [
      {
        href: '/organizations/{orgId}/settings/stores',
        label: 'Магазины',
        description: 'Точки продаж и создание новых',
        permission: 'organization:read',
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
    label: 'Команда',
    items: [
      {
        href: '/organizations/{orgId}/users',
        label: 'Сотрудники',
        description: 'Учётные записи, роли, доступ к магазинам',
        permission: 'users:read',
      },
    ],
  },
  {
    id: 'catalog-admin',
    label: 'Справочники (админ)',
    items: [
      {
        href: '/organizations/{orgId}/settings/catalog',
        label: 'Учёт и цены',
        description: 'Политики партий и розничные цены',
        permission: 'master-data:manage',
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
        description: 'Аудит изменений',
        permission: 'audit:read',
      },
    ],
  },
];

export const STORE_SETTINGS_NAV_CATEGORIES: SettingsNavCategory[] = [
  {
    id: 'store',
    label: 'Магазин',
    items: [
      {
        href: '/organizations/{orgId}/stores/{storeId}/settings',
        label: 'Профиль магазина',
        description: 'Название, адрес, часовой пояс, склад',
        anyPermission: ['stores:create'],
        storeScoped: true,
      },
      {
        href: '/organizations/{orgId}/stores/{storeId}/payment-methods',
        label: 'Способы оплаты',
        description: 'Каталог методов оплаты',
        anyPermission: ['payments:manage-methods'],
        storeScoped: true,
      },
    ],
  },
];

/** @deprecated Split into ORG + STORE categories */
export const SETTINGS_NAV_CATEGORIES = ORG_SETTINGS_NAV_CATEGORIES;

const ORG_SETTINGS_PATH_PATTERNS = [
  /^\/organizations\/[^/]+\/settings(\/|$)/,
  /^\/organizations\/[^/]+\/users(\/|$)/,
  /^\/organizations\/[^/]+\/audit(\/|$)/,
  /^\/organizations\/[^/]+\/integrations(\/|$)/,
];

const STORE_SETTINGS_PATH_PATTERNS = [
  /^\/organizations\/[^/]+\/stores\/[^/]+\/settings(\/|$)/,
  /^\/organizations\/[^/]+\/stores\/[^/]+\/payment-methods(\/|$)/,
];

const CATALOG_PATH_PATTERNS = [
  /^\/organizations\/[^/]+\/catalog(\/|$)/,
  /^\/organizations\/[^/]+\/master-data(\/|$)/,
];

const ACCOUNT_PATH_PATTERNS = [/^\/account(\/|$)/, /^\/change-password(\/|$)/];

export function orgSettingsHubHref(organizationId: string): string {
  return `/organizations/${organizationId}/settings`;
}

/** @deprecated Use orgSettingsHubHref */
export function settingsHubHref(organizationId: string): string {
  return orgSettingsHubHref(organizationId);
}

export function storeSettingsHubHref(organizationId: string, storeId: string): string {
  return `/organizations/${organizationId}/stores/${storeId}/settings`;
}

export function catalogHubHref(organizationId: string): string {
  return `/organizations/${organizationId}/catalog`;
}

export function accountSettingsHref(): string {
  return '/account';
}

export function orgSettingsBreadcrumbs(
  organizationId: string,
  ...trail: Array<{ label: string; href?: string }>
) {
  return [
    { label: 'Организации', href: '/organizations' },
    { label: 'Настройки ERP', href: orgSettingsHubHref(organizationId) },
    ...trail,
  ];
}

/** @deprecated Use orgSettingsBreadcrumbs */
export function settingsBreadcrumbs(
  organizationId: string,
  ...trail: Array<{ label: string; href?: string }>
) {
  return orgSettingsBreadcrumbs(organizationId, ...trail);
}

export function storeSettingsBreadcrumbs(
  organizationId: string,
  storeId: string,
  ...trail: Array<{ label: string; href?: string }>
) {
  return [
    { label: 'Организации', href: '/organizations' },
    { label: 'Настройки магазина', href: storeSettingsHubHref(organizationId, storeId) },
    ...trail,
  ];
}

export function catalogBreadcrumbs(
  organizationId: string,
  ...trail: Array<{ label: string; href?: string }>
) {
  return [
    { label: 'Организации', href: '/organizations' },
    { label: 'Справочник', href: catalogHubHref(organizationId) },
    ...trail,
  ];
}

export function catalogAdminBreadcrumbs(
  organizationId: string,
  ...trail: Array<{ label: string; href?: string }>
) {
  const base = `/organizations/${organizationId}/settings/catalog`;
  return orgSettingsBreadcrumbs(organizationId, { label: 'Учёт и цены', href: base }, ...trail);
}

/** @deprecated Use catalogBreadcrumbs or catalogAdminBreadcrumbs */
export function masterDataBreadcrumbs(
  organizationId: string,
  ...trail: Array<{ label: string; href?: string }>
) {
  return catalogBreadcrumbs(organizationId, ...trail);
}

export function isOrgSettingsAreaPath(pathname: string): boolean {
  return ORG_SETTINGS_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function isStoreSettingsAreaPath(pathname: string): boolean {
  return STORE_SETTINGS_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function isCatalogAreaPath(pathname: string): boolean {
  return CATALOG_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function isAccountAreaPath(pathname: string): boolean {
  return ACCOUNT_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function isSettingsAreaPath(pathname: string): boolean {
  return isOrgSettingsAreaPath(pathname) || isStoreSettingsAreaPath(pathname);
}

export function canAccessOrgSettings(hasPermission: (code: string) => boolean): boolean {
  return hasPermission(ORG_SETTINGS_ACCESS_PERMISSION);
}

export function canAccessStoreSettings(hasPermission: (code: string) => boolean): boolean {
  return STORE_SETTINGS_ACCESS_ANY.some((code) => hasPermission(code));
}

export function canOperateCatalog(hasPermission: (code: string) => boolean): boolean {
  return (
    hasPermission('master-data:operate') || hasPermission('master-data:manage')
  );
}

export function canManageCatalog(hasPermission: (code: string) => boolean): boolean {
  return hasPermission(CATALOG_ADMIN_PERMISSION);
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

function filterCategories(
  categories: SettingsNavCategory[],
  hasPermission: (code: string) => boolean,
  organizationId: string,
  storeId?: string | null,
) {
  return categories
    .map((category) => ({
      ...category,
      items: category.items
        .filter((item) => itemAllowed(item, hasPermission))
        .map((item) => {
          const href = resolveSettingsHref(item, organizationId, storeId);
          return href ? { ...item, href } : null;
        })
        .filter((item): item is SettingsNavItem & { href: string } => item !== null),
    }))
    .filter((category) => category.items.length > 0);
}

export function filterOrgSettingsNav(
  hasPermission: (code: string) => boolean,
  organizationId: string,
) {
  return filterCategories(ORG_SETTINGS_NAV_CATEGORIES, hasPermission, organizationId);
}

export function filterStoreSettingsNav(
  hasPermission: (code: string) => boolean,
  organizationId: string,
  storeId: string,
) {
  return filterCategories(STORE_SETTINGS_NAV_CATEGORIES, hasPermission, organizationId, storeId);
}

/** @deprecated Use filterOrgSettingsNav or filterStoreSettingsNav */
export function filterSettingsNav(
  hasPermission: (code: string) => boolean,
  organizationId: string,
  storeId?: string | null,
) {
  const org = filterOrgSettingsNav(hasPermission, organizationId);
  if (!storeId) return org;
  return [...org, ...filterStoreSettingsNav(hasPermission, organizationId, storeId)];
}

export function isSettingsNavItemActive(pathname: string, href: string): boolean {
  if (href.endsWith('/master-data') || href.endsWith('/catalog') || href.endsWith('/settings/catalog')) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
