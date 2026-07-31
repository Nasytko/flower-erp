'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { t } from '@/i18n/ru';
import {
  ACCOUNT_NAV,
  ORG_SETTINGS_NAV,
  STORE_SETTINGS_NAV,
  countStoreScopedEligible,
  filterNavByPermissions,
  isNavItemActive,
  PRIMARY_NAV,
  resolveNavWorkspace,
  resolveStoreHomePath,
} from '@/lib/nav';
import {
  isOrgSettingsAreaPath,
  isStoreSettingsAreaPath,
} from '@/lib/settings-nav';
import { NavIcon } from './nav-icons';
import { SettingsSubNav } from './settings-sub-nav';

export function SidebarNav({
  onNavigate,
  variant = 'rail',
}: {
  onNavigate?: () => void;
  variant?: 'rail' | 'expanded' | 'drawer';
}) {
  const pathname = usePathname();
  const auth = useAuth();
  const workspace = useMemo(
    () => resolveNavWorkspace(pathname, auth.organization?.id),
    [pathname, auth.organization?.id],
  );

  const inOrgSettings = isOrgSettingsAreaPath(pathname);
  const inStoreSettings = isStoreSettingsAreaPath(pathname);
  const inSettingsMode = inOrgSettings || inStoreSettings;

  const backToWorkHref = useMemo(() => {
    if (workspace.organizationId && workspace.storeId) {
      return resolveStoreHomePath(workspace.organizationId, workspace.storeId, auth.hasPermission);
    }
    return '/organizations';
  }, [auth.hasPermission, workspace.organizationId, workspace.storeId]);

  const items = inSettingsMode
    ? []
    : filterNavByPermissions(
        PRIMARY_NAV,
        auth.hasPermission,
        workspace.organizationId,
        workspace.storeId,
      );

  const orgSettingsItems = filterNavByPermissions(
    ORG_SETTINGS_NAV,
    auth.hasPermission,
    workspace.organizationId,
    workspace.storeId,
  );

  const storeSettingsItems = filterNavByPermissions(
    STORE_SETTINGS_NAV,
    auth.hasPermission,
    workspace.organizationId,
    workspace.storeId,
  );

  const accountItems = auth.user ? ACCOUNT_NAV.map((item) => ({ ...item, href: item.href })) : [];

  const needsStoreHint =
    !inSettingsMode &&
    !workspace.storeId &&
    countStoreScopedEligible(PRIMARY_NAV, auth.hasPermission) > 0;

  function renderLink(
    item: (typeof items)[number] | (typeof orgSettingsItems)[number] | (typeof accountItems)[number],
    options?: { isSettings?: boolean },
  ) {
    const isSettings = options?.isSettings ?? (item.label.includes('Настройки') || item.label === 'Магазин');
    const active =
      isNavItemActive(pathname, item.href) ||
      (item.label === 'Настройки ERP' && inOrgSettings) ||
      (item.label === 'Магазин' && inStoreSettings);
    return (
      <Link
        key={`${item.label}:${item.href}`}
        href={item.href}
        className={
          isSettings
            ? 'shell__nav-link shell__nav-link--settings'
            : 'shell__nav-link'
        }
        aria-current={active ? 'page' : undefined}
        aria-label={item.label}
        title={item.label}
        onClick={onNavigate}
      >
        <span className="shell__nav-icon">
          <NavIcon label={item.label} />
        </span>
        <span className="shell__nav-text">{item.label}</span>
      </Link>
    );
  }

  const footerItems = [...orgSettingsItems, ...storeSettingsItems, ...accountItems];

  return (
    <nav className={`shell__nav shell__nav--${variant}`} aria-label={t('navigate')}>
      {inSettingsMode ? (
        <div className="shell__nav-settings-mode">
          <Link
            href={backToWorkHref}
            className="shell__nav-link shell__nav-link--settings"
            onClick={onNavigate}
          >
            <span className="shell__nav-text">← К работе</span>
          </Link>
        </div>
      ) : null}
      {!inSettingsMode && needsStoreHint ? (
        <p className="shell__nav-hint">{t('selectStoreHint')}</p>
      ) : null}
      {!inSettingsMode ? <div className="shell__nav-primary">{items.map((item) => renderLink(item))}</div> : null}
      {inSettingsMode ? <SettingsSubNav onNavigate={onNavigate} /> : null}
      {!inSettingsMode && footerItems.length > 0 ? (
        <div className="shell__nav-footer">{footerItems.map((item) => renderLink(item, { isSettings: item.label !== 'Профиль' }))}</div>
      ) : null}
    </nav>
  );
}
