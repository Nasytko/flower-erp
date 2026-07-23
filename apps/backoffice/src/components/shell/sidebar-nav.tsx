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
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  PRIMARY_NAV,
  resolveNavWorkspace,
  type NavGroup,
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
    !workspace.storeId &&
    countStoreScopedEligible(PRIMARY_NAV, auth.hasPermission) > 0;

  return (
    <nav className="shell__nav" aria-label={t('navigate')}>
      {NAV_GROUP_ORDER.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        const showStoreHint =
          needsStoreHint && (group === 'work' || group === 'store');
        const eligibleWithoutStore =
          showStoreHint &&
          countStoreScopedEligible(PRIMARY_NAV, auth.hasPermission, group) > 0;

        if (groupItems.length === 0 && !eligibleWithoutStore) {
          return null;
        }

        return (
          <div key={group} className="shell__nav-group" data-group={group}>
            <p className="shell__nav-label">{NAV_GROUP_LABELS[group as NavGroup]}</p>
            {eligibleWithoutStore ? (
              <p className="shell__nav-hint">{t('selectStoreHint')}</p>
            ) : null}
            {groupItems.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="shell__nav-link"
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
