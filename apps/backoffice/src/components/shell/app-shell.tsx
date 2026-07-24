'use client';

import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { t } from '@/i18n/ru';
import { resolveNavWorkspace, resolveStoreHomePath } from '@/lib/nav';
import { DesktopSidebar } from './desktop-sidebar';
import { MobileDrawer } from './mobile-drawer';
import { SidebarProvider, useSidebar } from './sidebar-context';
import { WorkspaceSwitcher } from './workspace-switcher';
import { WorkspaceContextSync } from './workspace-context-sync';
import { CommandPalette } from '@/components/workspace/command-palette';

function openCommandPalette() {
  window.dispatchEvent(new CustomEvent('flower:command-palette'));
}

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();
  const { expanded } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

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

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <div
      className={expanded ? 'shell shell--sidebar-expanded' : 'shell shell--sidebar-collapsed'}
    >
      <WorkspaceContextSync />
      <DesktopSidebar />
      <MobileDrawer open={mobileOpen} onClose={closeMobile} />

      <header className="shell__header">
        <div className="shell__header-left">
          <button
            type="button"
            className="shell__menu-btn"
            aria-label={mobileOpen ? t('closeNav') : t('openNav')}
            aria-expanded={mobileOpen}
            aria-controls="shell-mobile-drawer"
            onClick={() => setMobileOpen((current) => !current)}
          >
            {t('menu')}
          </button>
          <Link href={homeHref} className="shell__title">
            {t('backoffice')}
          </Link>
          <WorkspaceSwitcher />
        </div>
        <div className="shell__header-right">
          <button
            type="button"
            className="shell__search"
            onClick={openCommandPalette}
            aria-label={t('commandPalette')}
          >
            <span className="shell__search-placeholder">{t('commandPlaceholder')}</span>
            <kbd className="shell__search-kbd">Ctrl K</kbd>
          </button>
          {auth.user ? (
            <div className="shell__user-menu">
              <span className="shell__avatar" aria-hidden="true">
                {initials || '•'}
              </span>
              <span className="shell__user-name">{auth.user.displayName}</span>
              <button type="button" className="shell__logout" onClick={() => void auth.logout()}>
                {t('logout')}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="shell__main">{children}</div>
      <CommandPalette />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppShellInner>{children}</AppShellInner>
    </SidebarProvider>
  );
}
