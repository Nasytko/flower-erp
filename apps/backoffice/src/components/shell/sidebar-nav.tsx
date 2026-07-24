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

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
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

  const needsStoreHint =
    !workspace.storeId && countStoreScopedEligible(PRIMARY_NAV, auth.hasPermission) > 0;

  return (
    <nav className="shell__nav" aria-label={t('navigate')}>
      {needsStoreHint ? <p className="shell__nav-hint">{t('selectStoreHint')}</p> : null}
      {items.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        return (
          <Link
            key={`${item.label}:${item.href}`}
            href={item.href}
            className="shell__nav-link"
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
