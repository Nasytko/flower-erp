import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PaginatedResponse } from '@flower/contracts';
import { RequirePermissions, SkipOrgMatch } from '../../auth/presentation/auth.decorators';
import { CurrentAuthContext } from '../../auth/presentation/current-auth-context.decorator';
import type { AuthContext } from '../../../infrastructure/context/request-context';
import { OrganizationUseCases } from '../application/organization.use-cases';
import {
  ArchiveDto,
  CreateOrganizationDto,
  CreateStoreDto,
  OrganizationIdParamDto,
  PaginationQueryDto,
  StoreIdParamDto,
  WarehouseIdParamDto,
} from './organization.dto';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly useCases: OrganizationUseCases) {}

  @Post()
  @RequirePermissions('organization:manage')
  @SkipOrgMatch()
  @ApiOperation({ summary: 'Create organization' })
  createOrganization(@Body() body: CreateOrganizationDto) {
    return this.useCases.createOrganization(body);
  }

  @Get()
  @RequirePermissions('organization:read')
  @SkipOrgMatch()
  @ApiOperation({ summary: 'List organizations accessible to current user' })
  async listOrganizations(
    @CurrentAuthContext() auth: AuthContext,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponse<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const result = await this.useCases.listOrganizationsForUser(auth.userId, page, pageSize);
    return {
      items: result.items,
      page: result.page,
      pageSize: result.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / result.pageSize) || 1),
    };
  }

  @Get(':organizationId')
  @RequirePermissions('organization:read')
  @ApiOperation({ summary: 'Get organization' })
  getOrganization(@Param() params: OrganizationIdParamDto) {
    return this.useCases.getOrganization(params.organizationId);
  }

  @Post(':organizationId/archive')
  @RequirePermissions('organization:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive organization (soft)' })
  archiveOrganization(
    @Param() params: OrganizationIdParamDto,
    @Body() body: ArchiveDto,
  ) {
    return this.useCases.archiveOrganization({
      organizationId: params.organizationId,
      reason: body.reason,
    });
  }

  @Post(':organizationId/stores')
  @RequirePermissions('stores:create')
  @ApiOperation({ summary: 'Create store with default warehouse' })
  createStore(
    @Param() params: OrganizationIdParamDto,
    @Body() body: CreateStoreDto,
  ) {
    return this.useCases.createStoreWithDefaultWarehouse({
      organizationId: params.organizationId,
      ...body,
    });
  }

  @Get(':organizationId/stores')
  @RequirePermissions('stores:read')
  @ApiOperation({ summary: 'List stores in organization' })
  async listStores(
    @Param() params: OrganizationIdParamDto,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponse<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const result = await this.useCases.listStores(params.organizationId, page, pageSize);
    return {
      items: result.items,
      page: result.page,
      pageSize: result.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / result.pageSize) || 1),
    };
  }

  @Get(':organizationId/stores/:storeId')
  @RequirePermissions('stores:read')
  @ApiOperation({ summary: 'Get store (tenant-scoped)' })
  getStore(@Param() params: StoreIdParamDto) {
    return this.useCases.getStore(params.organizationId, params.storeId);
  }

  @Post(':organizationId/stores/:storeId/archive')
  @RequirePermissions('stores:archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive store (soft)' })
  archiveStore(@Param() params: StoreIdParamDto, @Body() body: ArchiveDto) {
    return this.useCases.archiveStore({
      organizationId: params.organizationId,
      storeId: params.storeId,
      reason: body.reason,
    });
  }

  @Get(':organizationId/stores/:storeId/warehouses')
  @RequirePermissions('stores:read')
  @ApiOperation({ summary: 'List warehouses for store' })
  listWarehouses(@Param() params: StoreIdParamDto) {
    return this.useCases.listWarehouses(params.organizationId, params.storeId);
  }

  @Get(':organizationId/stores/:storeId/warehouses/:warehouseId')
  @RequirePermissions('stores:read')
  @ApiOperation({ summary: 'Get warehouse (tenant-scoped)' })
  getWarehouse(@Param() params: WarehouseIdParamDto) {
    return this.useCases.getWarehouse(
      params.organizationId,
      params.storeId,
      params.warehouseId,
    );
  }
}
