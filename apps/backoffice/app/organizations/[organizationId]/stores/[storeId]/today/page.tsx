'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Legacy route — merged into Обзор (?tab=queue). */
export default function TodayRedirectPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(
      `/organizations/${params.organizationId}/stores/${params.storeId}/home?tab=queue`,
    );
  }, [params.organizationId, params.storeId, router]);

  return null;
}
