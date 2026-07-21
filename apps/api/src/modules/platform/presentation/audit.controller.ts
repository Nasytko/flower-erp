import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { AuditQueryUseCases } from '../application/audit-query.use-cases';
import { ListAuditQueryDto, OrganizationParamsDto } from './platform.dto';

@ApiTags('audit')
@Controller('organizations/:organizationId/audit')
@RequirePermissions('audit:read')
export class AuditController {
  constructor(private readonly audit: AuditQueryUseCases) {}

  @Get()
  list(@Param() params: OrganizationParamsDto, @Query() query: ListAuditQueryDto) {
    return this.audit.listAudit(params.organizationId, query);
  }
}
