'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { t } from '@/i18n/ru';
import { filterNavByPermissions, isNavItemActive, parseStoreRoute, PRIMARY_NAV } from '@/lib/nav';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const auth = useAuth();
  const route = parseStoreRoute(pathname);
  const organizationId = auth.organization?.id ?? route.organizationId;
  const items = filterNavByPermissions(
    PRIMARY_NAV,
    auth.hasPermission,
    organizationId,
    route.storeId,
  );

  const ops = items.filter((item) => item.group !== 'admin');
  const admin = items.filter((item) => item.group === 'admin');

  return (
    <nav className="shell__nav" aria-label={t('navigate')}>
      {ops.length > 0 ? (
        <div className="shell__nav-group">
          <p className="shell__nav-label">{t('operations')}</p>
          {ops.map((item) => {
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
      ) : null}
      {admin.length > 0 ? (
        <div className="shell__nav-group">
          <p className="shell__nav-label">{t('admin')}</p>
          {admin.map((item) => {
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
      ) : null}
    </nav>
  );
}
