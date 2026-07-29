'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Legacy route — смена теперь в календаре заказов. */
export default function TodayRedirectPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(
      `/organizations/${params.organizationId}/stores/${params.storeId}/orders/calendar`,
    );
  }, [params.organizationId, params.storeId, router]);

  return null;
}
