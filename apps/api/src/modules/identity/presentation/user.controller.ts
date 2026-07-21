import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { CurrentAuthContext } from '../../auth/presentation/current-auth-context.decorator';
import type { AuthContext } from '../../../infrastructure/context/request-context';
import { UserManagementUseCases } from '../application/user-management.use-cases';
import {
  AssignRolesDto,
  CreateUserDto,
  OrganizationUserParamsDto,
  ResetPasswordDto,
  SetStoreAccessDto,
} from './identity.dto';

@ApiTags('users')
@Controller('organizations/:organizationId/users')
@RequirePermissions('users:read')
export class UserController {
  constructor(private readonly users: UserManagementUseCases) {}

  @Get()
  list(@Param('organizationId') organizationId: string) {
    return this.users.listUsers(organizationId);
  }

  @Post()
  @RequirePermissions('users:manage')
  create(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateUserDto,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.users.createUser(organizationId, body, auth);
  }

  @Get(':userId')
  get(@Param() params: OrganizationUserParamsDto) {
    return this.users.getUser(params.organizationId, params.userId);
  }

  @Post(':userId/block')
  @RequirePermissions('users:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  block(@Param() params: OrganizationUserParamsDto) {
    return this.users.blockUser(params.organizationId, params.userId);
  }

  @Post(':userId/unblock')
  @RequirePermissions('users:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  unblock(@Param() params: OrganizationUserParamsDto) {
    return this.users.unblockUser(params.organizationId, params.userId);
  }

  @Post(':userId/archive')
  @RequirePermissions('users:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  archive(@Param() params: OrganizationUserParamsDto) {
    return this.users.archiveUser(params.organizationId, params.userId);
  }

  @Post(':userId/reset-password')
  @RequirePermissions('users:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Param() params: OrganizationUserParamsDto, @Body() body: ResetPasswordDto) {
    return this.users.resetPassword(params.organizationId, params.userId, body.password);
  }

  @Post(':userId/roles')
  @RequirePermissions('roles:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  assignRoles(@Param() params: OrganizationUserParamsDto, @Body() body: AssignRolesDto) {
    return this.users.assignRoles(params.organizationId, params.userId, body.roleCodes);
  }

  @Post(':userId/store-access')
  @RequirePermissions('roles:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  storeAccess(@Param() params: OrganizationUserParamsDto, @Body() body: SetStoreAccessDto) {
    return this.users.setStoreAccess(params.organizationId, params.userId, body);
  }
}
