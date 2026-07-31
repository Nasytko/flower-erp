import { SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '@flower/permissions';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
export const ANY_PERMISSIONS_KEY = 'anyPermissions';
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
export const RequireAnyPermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);

export const SKIP_STORE_SCOPE_KEY = 'skipStoreScope';
export const SkipStoreScope = () => SetMetadata(SKIP_STORE_SCOPE_KEY, true);

export const SKIP_ORG_MATCH_KEY = 'skipOrgMatch';
export const SkipOrgMatch = () => SetMetadata(SKIP_ORG_MATCH_KEY, true);

export const ALLOW_MUST_CHANGE_PASSWORD_KEY = 'allowMustChangePassword';
export const AllowMustChangePassword = () => SetMetadata(ALLOW_MUST_CHANGE_PASSWORD_KEY, true);
