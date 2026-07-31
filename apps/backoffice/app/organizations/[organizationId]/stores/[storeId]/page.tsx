'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { resolveStoreHomePath } from '@/lib/nav';

/** Legacy route — redirects to the current store home (order calendar). */
export default function StoreDetailRedirectPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    router.replace(
      resolveStoreHomePath(params.organizationId, params.storeId, auth.hasPermission),
    );
  }, [params.organizationId, params.storeId, auth.hasPermission, router]);

  return null;
}
