'use client';

import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { DesktopSidebar } from './desktop-sidebar';
import { MobileDrawer } from './mobile-drawer';
import { OrganizationSwitcherPlaceholder } from './placeholders';
import { CommandPalette } from '@/components/workspace/command-palette';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <div className="shell">
      <DesktopSidebar />
      <MobileDrawer open={mobileOpen} onClose={closeMobile} />

      <header className="shell__header">
        <div className="shell__header-left">
          <button
            type="button"
            className="shell__menu-btn"
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
            aria-controls="shell-mobile-drawer"
            onClick={() => setMobileOpen((current) => !current)}
          >
            Menu
          </button>
          <span className="shell__title">Backoffice</span>
          <OrganizationSwitcherPlaceholder />
        </div>
        <div className="shell__header-right">
          {auth.user ? (
            <div className="shell__user-menu">
              <span>{auth.user.displayName}</span>
              {auth.organization ? <span>{auth.organization.name}</span> : null}
              <button type="button" onClick={() => void auth.logout()}>
                Logout
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