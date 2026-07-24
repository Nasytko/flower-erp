'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { LoadingState } from '@/components/layout/states';
import { resolveNavWorkspace, resolveStoreHomePath } from '@/lib/nav';

/**
 * Legacy «Обзор» (`/`) is no longer a product home screen.
 * Redirect to permission-based store home (Сегодня / Доставка).
 */
export default function RootRedirectPage() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const workspace = useMemo(
    () => resolveNavWorkspace(pathname, auth.organization?.id),
    [pathname, auth.organization?.id],
  );

  useEffect(() => {
    if (auth.loading) return;

    if (!auth.organization?.id) {
      router.replace('/login');
      return;
    }

    if (workspace.organizationId && workspace.storeId) {
      router.replace(
        resolveStoreHomePath(workspace.organizationId, workspace.storeId, auth.hasPermission),
      );
      return;
    }

    router.replace('/organizations');
  }, [
    auth.loading,
    auth.organization?.id,
    auth.hasPermission,
    router,
    workspace.organizationId,
    workspace.storeId,
  ]);

  return (
    <main>
      <LoadingState message="Переход…" />
    </main>
  );
}
