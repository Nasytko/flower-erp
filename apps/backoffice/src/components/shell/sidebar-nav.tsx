'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
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

  return (
    <nav className="shell__nav" aria-label="Primary">
      <p className="shell__nav-label">Workspace</p>
      {items.map((item) => {
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
    </nav>
  );
}
