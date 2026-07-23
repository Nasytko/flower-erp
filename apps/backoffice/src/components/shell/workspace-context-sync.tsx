'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { rememberWorkspaceFromPath } from '@/lib/nav';

/** Keeps last store in sync whenever the user is on a store-scoped route. */
export function WorkspaceContextSync() {
  const pathname = usePathname();

  useEffect(() => {
    rememberWorkspaceFromPath(pathname);
  }, [pathname]);

  return null;
}
