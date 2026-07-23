'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { t } from '@/i18n/ru';
import { resolveNavWorkspace, resolveStoreHomePath } from '@/lib/nav';
import { SidebarNav } from './sidebar-nav';

export function DesktopSidebar() {
  const auth = useAuth();
  const pathname = usePathname();
  const workspace = useMemo(
    () => resolveNavWorkspace(pathname, auth.organization?.id),
    [pathname, auth.organization?.id],
  );

  const homeHref =
    workspace.organizationId && workspace.storeId
      ? resolveStoreHomePath(workspace.organizationId, workspace.storeId, auth.hasPermission)
      : '/';

  return (
    <aside className="shell__sidebar" aria-label={t('backoffice')}>
      <Link href={homeHref} className="shell__brand">
        {t('brand')}
      </Link>
      <SidebarNav />
    </aside>
  );
}
