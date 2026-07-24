'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { t } from '@/i18n/ru';
import {
  countStoreScopedEligible,
  filterNavByPermissions,
  isNavItemActive,
  PRIMARY_NAV,
  resolveNavWorkspace,
} from '@/lib/nav';
import { NavIcon } from './nav-icons';

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

  const items = filterNavByPermissions(
    PRIMARY_NAV,
    auth.hasPermission,
    workspace.organizationId,
    workspace.storeId,
  );

  const settings = items.filter((item) => item.label === 'Настройки');
  const primary = items.filter((item) => item.label !== 'Настройки');

  const needsStoreHint =
    !workspace.storeId && countStoreScopedEligible(PRIMARY_NAV, auth.hasPermission) > 0;

  function renderLink(item: (typeof items)[number]) {
    const active = isNavItemActive(pathname, item.href);
    return (
      <Link
        key={`${item.label}:${item.href}`}
        href={item.href}
        className={
          item.label === 'Настройки' ? 'shell__nav-link shell__nav-link--settings' : 'shell__nav-link'
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

  return (
    <nav className={`shell__nav shell__nav--${variant}`} aria-label={t('navigate')}>
      {needsStoreHint ? <p className="shell__nav-hint">{t('selectStoreHint')}</p> : null}
      <div className="shell__nav-primary">{primary.map(renderLink)}</div>
      {settings.length > 0 ? <div className="shell__nav-footer">{settings.map(renderLink)}</div> : null}
    </nav>
  );
}
