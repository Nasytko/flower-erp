'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Legacy route — order list removed; staff work from the calendar. */
export default function OrdersRedirectPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(
      `/organizations/${params.organizationId}/stores/${params.storeId}/orders/calendar`,
    );
  }, [params.organizationId, params.storeId, router]);

  return null;
}
