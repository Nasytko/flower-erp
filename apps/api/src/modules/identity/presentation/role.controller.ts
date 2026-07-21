import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { UserManagementUseCases } from '../application/user-management.use-cases';
import { OrganizationParamsDto } from './identity.dto';

@ApiTags('roles')
@Controller('organizations/:organizationId/roles')
@RequirePermissions('roles:manage')
export class RoleController {
  constructor(private readonly users: UserManagementUseCases) {}

  @Get()
  list(@Param() params: OrganizationParamsDto) {
    return this.users.listRoles(params.organizationId);
  }
}
