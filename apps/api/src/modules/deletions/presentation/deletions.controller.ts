import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireAnyPermissions, RequirePermissions } from '../../auth/presentation/auth.decorators';
import { DeletionRequestUseCases } from '../application/deletion-request.use-cases';
import {
  CreateDeletionRequestDto,
  ListDeletionRequestsQueryDto,
  OrganizationParamsDto,
  ReviewDeletionRequestDto,
  DeletionRequestParamsDto,
} from './deletions.dto';

@ApiTags('deletions')
@Controller('organizations/:organizationId/deletion-requests')
export class DeletionsController {
  constructor(private readonly deletions: DeletionRequestUseCases) {}

  @Post()
  @ApiOperation({ summary: 'Request permanent deletion (requires director/developer approval)' })
  @RequireAnyPermissions('deletions:request')
  create(@Param() params: OrganizationParamsDto, @Body() body: CreateDeletionRequestDto) {
    return this.deletions.createRequest({
      organizationId: params.organizationId,
      entityType: body.entityType,
      entityId: body.entityId,
      entityLabel: body.entityLabel,
      storeId: body.storeId,
      reason: body.reason,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List deletion requests' })
  @RequirePermissions('deletions:read')
  list(@Param() params: OrganizationParamsDto, @Query() query: ListDeletionRequestsQueryDto) {
    return this.deletions.listRequests(params.organizationId, {
      status: query.status,
    });
  }

  @Post(':requestId/approve')
  @ApiOperation({ summary: 'Approve deletion and permanently remove the record' })
  @RequirePermissions('deletions:approve')
  approve(@Param() params: DeletionRequestParamsDto, @Body() body: ReviewDeletionRequestDto) {
    return this.deletions.approveRequest({
      organizationId: params.organizationId,
      requestId: params.requestId,
      comment: body.comment,
    });
  }

  @Post(':requestId/reject')
  @ApiOperation({ summary: 'Reject deletion request' })
  @RequirePermissions('deletions:approve')
  reject(@Param() params: DeletionRequestParamsDto, @Body() body: ReviewDeletionRequestDto) {
    return this.deletions.rejectRequest({
      organizationId: params.organizationId,
      requestId: params.requestId,
      comment: body.comment,
    });
  }
}
