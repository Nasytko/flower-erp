'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Legacy route — KPI директора объединены с /reports. */
export default function OperationsRedirectPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(
      `/organizations/${params.organizationId}/stores/${params.storeId}/reports`,
    );
  }, [params.organizationId, params.storeId, router]);

  return null;
}
