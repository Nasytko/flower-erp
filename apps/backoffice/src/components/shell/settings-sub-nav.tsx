'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import {
  filterSettingsNav,
  isSettingsNavItemActive,
  SETTINGS_ACCESS_PERMISSION,
} from '@/lib/settings-nav';
import { resolveNavWorkspace } from '@/lib/nav';

export function SettingsSubNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const auth = useAuth();

  const workspace = useMemo(
    () => resolveNavWorkspace(pathname, auth.organization?.id),
    [pathname, auth.organization?.id],
  );

  if (!auth.hasPermission(SETTINGS_ACCESS_PERMISSION)) {
    return null;
  }

  if (!workspace.organizationId) {
    return null;
  }

  const categories = filterSettingsNav(
    auth.hasPermission,
    workspace.organizationId,
    workspace.storeId,
  );

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="shell__nav-settings" aria-label="Настройки">
      <p className="shell__nav-settings-heading">Настройки</p>
      {categories.map((category) => (
        <div key={category.id} className="shell__nav-settings-group">
          <p className="shell__nav-settings-category">{category.label}</p>
          {category.items.map((item) => {
            const active = isSettingsNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? 'shell__nav-link shell__nav-link--settings shell__nav-link--active'
                    : 'shell__nav-link shell__nav-link--settings'
                }
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
              >
                <span className="shell__nav-text">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
