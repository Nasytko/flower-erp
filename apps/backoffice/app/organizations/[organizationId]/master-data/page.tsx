'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { catalogHubHref } from '@/lib/settings-nav';

/** Legacy hub — redirects to operational catalog. */
export default function MasterDataRedirectPage() {
  const params = useParams<{ organizationId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(catalogHubHref(params.organizationId));
  }, [params.organizationId, router]);

  return null;
}
