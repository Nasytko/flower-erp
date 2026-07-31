'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { settingsHubHref } from '@/lib/settings-nav';

/** Legacy org root — opens the ERP settings hub. */
export default function OrganizationRootRedirectPage() {
  const params = useParams<{ organizationId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(settingsHubHref(params.organizationId));
  }, [params.organizationId, router]);

  return null;
}
