'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Legacy route — рабочий экран смены перенесён на /today. */
export default function StoreHomeRedirectPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(
      `/organizations/${params.organizationId}/stores/${params.storeId}/today`,
    );
  }, [params.organizationId, params.storeId, router]);

  return null;
}
