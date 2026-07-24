'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { t } from '@/i18n/ru';
import { resolveNavWorkspace, resolveStoreHomePath } from '@/lib/nav';
import { SidebarNav } from './sidebar-nav';
import { useSidebar } from './sidebar-context';

export function DesktopSidebar() {
  const auth = useAuth();
  const pathname = usePathname();
  const { expanded, toggle } = useSidebar();
  const workspace = useMemo(
    () => resolveNavWorkspace(pathname, auth.organization?.id),
    [pathname, auth.organization?.id],
  );

  const homeHref =
    workspace.organizationId && workspace.storeId
      ? resolveStoreHomePath(workspace.organizationId, workspace.storeId, auth.hasPermission)
      : '/';

  const initials = (auth.user?.displayName ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <aside
      className={
        expanded ? 'shell__sidebar shell__sidebar--expanded' : 'shell__sidebar shell__sidebar--collapsed'
      }
      aria-label={t('backoffice')}
    >
      <div className="shell__sidebar-top">
        <Link href={homeHref} className="shell__brand" aria-label={t('brand')} title={t('brand')}>
          <span className="shell__brand-mark" aria-hidden="true">
            F
          </span>
          <span className="shell__brand-text">{t('brand')}</span>
        </Link>
        <button
          type="button"
          className="shell__sidebar-toggle"
          onClick={toggle}
          aria-pressed={expanded}
          aria-label={expanded ? t('collapseNav') : t('expandNav')}
          title={expanded ? t('collapseNav') : t('expandNav')}
        >
          {expanded ? '«' : '»'}
        </button>
      </div>

      <SidebarNav variant={expanded ? 'expanded' : 'rail'} />

      <div className="shell__sidebar-user">
        {auth.user ? (
          <>
            <span className="shell__avatar" aria-hidden="true">
              {initials || '•'}
            </span>
            <div className="shell__sidebar-user-meta">
              <strong>{auth.user.displayName}</strong>
              <span>{auth.organization?.name ?? t('backoffice')}</span>
            </div>
            <button
              type="button"
              className="shell__sidebar-logout"
              onClick={() => void auth.logout()}
              aria-label={t('logout')}
              title={t('logout')}
            >
              ⎋
            </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}
