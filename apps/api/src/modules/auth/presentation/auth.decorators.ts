import { SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '@flower/permissions';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const SKIP_STORE_SCOPE_KEY = 'skipStoreScope';
export const SkipStoreScope = () => SetMetadata(SKIP_STORE_SCOPE_KEY, true);

export const SKIP_ORG_MATCH_KEY = 'skipOrgMatch';
export const SkipOrgMatch = () => SetMetadata(SKIP_ORG_MATCH_KEY, true);
