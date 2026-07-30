import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PaginatedResponse } from '@flower/contracts';
import { RequirePermissions } from '../../auth/presentation/auth.decorators';
import { SupplierUseCases } from '../application/supplier.use-cases';
import { CategoryUseCases } from '../application/category.use-cases';
import { PolicyUseCases } from '../application/policy.use-cases';
import { ItemUseCases } from '../application/item.use-cases';
import { RetailPriceUseCases } from '../application/retail-price.use-cases';
import { SeedDefaultMasterDataUseCases } from '../application/seed-default-master-data.use-cases';
import {
  ArchiveDto,
  CategoryIdParamDto,
  CreateCategoryDto,
  CreateItemDto,
  UpdateItemDto,
  CreatePolicyDto,
  CreateSupplierDto,
  ItemIdParamDto,
  ListItemsQueryDto,
  ListRetailPricesQueryDto,
  ListSuppliersQueryDto,
  OrganizationIdParamDto,
  PaginationQueryDto,
  PolicyIdParamDto,
  ResolveRetailCompositionDto,
  SetItemRecipeDto,
  UpsertRetailPricesDto,
  SupplierIdParamDto,
} from './master-data.dto';

function toPage<T>(result: {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
}): PaginatedResponse<T> {
  return {
    items: result.items,
    page: result.page,
    pageSize: result.pageSize,
    totalItems: result.totalItems,
    totalPages: Math.max(1, Math.ceil(result.totalItems / result.pageSize) || 1),
  };
}

@ApiTags('master-data')
@RequirePermissions('master-data:read')
@Controller('organizations/:organizationId')
export class MasterDataController {
  constructor(
    private readonly suppliers: SupplierUseCases,
    private readonly categories: CategoryUseCases,
    private readonly policies: PolicyUseCases,
    private readonly items: ItemUseCases,
    private readonly retailPrices: RetailPriceUseCases,
    private readonly defaults: SeedDefaultMasterDataUseCases,
  ) {}

  // ─── Suppliers ────────────────────────────────────────────────────────────

  @Post('master-data/seed-defaults')
  @RequirePermissions('master-data:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Seed default units and inventory policies' })
  async seedDefaults(@Param() params: OrganizationIdParamDto) {
    await this.defaults.seedDefaults(params.organizationId);
    return { seeded: true };
  }

  @Post('suppliers')
  @RequirePermissions('master-data:manage')
  @ApiOperation({ summary: 'Create supplier' })
  createSupplier(@Param() params: OrganizationIdParamDto, @Body() body: CreateSupplierDto) {
    return this.suppliers.createSupplier({ organizationId: params.organizationId, ...body });
  }

  @Get('suppliers')
  @ApiOperation({ summary: 'List suppliers' })
  async listSuppliers(
    @Param() params: OrganizationIdParamDto,
    @Query() query: ListSuppliersQueryDto,
  ) {
    const result = await this.suppliers.listSuppliers(
      params.organizationId,
      query.page ?? 1,
      query.pageSize ?? 20,
      { status: query.status, name: query.name },
    );
    return toPage(result);
  }

  @Get('suppliers/:supplierId')
  @ApiOperation({ summary: 'Get supplier' })
  getSupplier(@Param() params: SupplierIdParamDto) {
    return this.suppliers.getSupplier(params.organizationId, params.supplierId);
  }

  @Post('suppliers/:supplierId/archive')
  @RequirePermissions('master-data:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive supplier' })
  archiveSupplier(@Param() params: SupplierIdParamDto, @Body() body: ArchiveDto) {
    return this.suppliers.archiveSupplier({
      organizationId: params.organizationId,
      supplierId: params.supplierId,
      reason: body.reason,
    });
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  @Post('categories')
  @RequirePermissions('master-data:manage')
  @ApiOperation({ summary: 'Create item category' })
  createCategory(@Param() params: OrganizationIdParamDto, @Body() body: CreateCategoryDto) {
    return this.categories.createCategory({
      organizationId: params.organizationId,
      name: body.name,
      code: body.code,
      parentId: body.parentId,
    });
  }

  @Get('categories')
  @ApiOperation({ summary: 'List item categories' })
  async listCategories(
    @Param() params: OrganizationIdParamDto,
    @Query() query: PaginationQueryDto,
  ) {
    const result = await this.categories.listCategories(
      params.organizationId,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
    return toPage(result);
  }

  @Get('categories/:categoryId')
  @ApiOperation({ summary: 'Get item category' })
  getCategory(@Param() params: CategoryIdParamDto) {
    return this.categories.getCategory(params.organizationId, params.categoryId);
  }

  @Post('categories/:categoryId/archive')
  @RequirePermissions('master-data:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive item category' })
  archiveCategory(@Param() params: CategoryIdParamDto, @Body() body: ArchiveDto) {
    return this.categories.archiveCategory({
      organizationId: params.organizationId,
      categoryId: params.categoryId,
      reason: body.reason,
    });
  }

  // ─── Policies ─────────────────────────────────────────────────────────────

  @Post('policies')
  @RequirePermissions('master-data:manage')
  @ApiOperation({ summary: 'Create inventory policy' })
  createPolicy(@Param() params: OrganizationIdParamDto, @Body() body: CreatePolicyDto) {
    return this.policies.createInventoryPolicy({
      organizationId: params.organizationId,
      ...body,
    });
  }

  @Get('policies')
  @ApiOperation({ summary: 'List inventory policies' })
  async listPolicies(
    @Param() params: OrganizationIdParamDto,
    @Query() query: PaginationQueryDto,
  ) {
    const result = await this.policies.listPolicies(
      params.organizationId,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
    return toPage(result);
  }

  @Post('policies/:policyId/archive')
  @RequirePermissions('master-data:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive inventory policy' })
  archivePolicy(@Param() params: PolicyIdParamDto, @Body() body: ArchiveDto) {
    return this.policies.archiveInventoryPolicy({
      organizationId: params.organizationId,
      policyId: params.policyId,
      reason: body.reason,
    });
  }

  // ─── Items ────────────────────────────────────────────────────────────────

  @Post('items')
  @RequirePermissions('master-data:manage')
  @ApiOperation({ summary: 'Create item' })
  createItem(@Param() params: OrganizationIdParamDto, @Body() body: CreateItemDto) {
    return this.items.createItem({ organizationId: params.organizationId, ...body });
  }

  @Get('items')
  @ApiOperation({ summary: 'List items with filters' })
  async listItems(@Param() params: OrganizationIdParamDto, @Query() query: ListItemsQueryDto) {
    const result = await this.items.listItems(
      params.organizationId,
      query.page ?? 1,
      query.pageSize ?? 20,
      {
        categoryId: query.categoryId,
        itemType: query.itemType,
        status: query.status,
        name: query.name,
        code: query.code,
        sortBy: query.sortBy,
        sortDir: query.sortDir,
      },
    );
    return toPage(result);
  }

  @Get('items/:itemId')
  @ApiOperation({ summary: 'Get item' })
  getItem(@Param() params: ItemIdParamDto) {
    return this.items.getItem(params.organizationId, params.itemId);
  }

  @Patch('items/:itemId')
  @RequirePermissions('master-data:manage')
  @ApiOperation({ summary: 'Update item' })
  updateItem(@Param() params: ItemIdParamDto, @Body() body: UpdateItemDto) {
    return this.items.updateItem({
      organizationId: params.organizationId,
      itemId: params.itemId,
      ...body,
    });
  }

  @Post('items/:itemId/archive')
  @RequirePermissions('master-data:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive item' })
  archiveItem(@Param() params: ItemIdParamDto, @Body() body: ArchiveDto) {
    return this.items.archiveItem({
      organizationId: params.organizationId,
      itemId: params.itemId,
      reason: body.reason,
    });
  }

  @Get('items/:itemId/recipe')
  @ApiOperation({ summary: 'Get item showcase recipe (BOM)' })
  getItemRecipe(@Param() params: ItemIdParamDto) {
    return this.items.getItemRecipe(params.organizationId, params.itemId);
  }

  @Put('items/:itemId/recipe')
  @RequirePermissions('master-data:manage')
  @ApiOperation({ summary: 'Replace item showcase recipe (BOM)' })
  setItemRecipe(@Param() params: ItemIdParamDto, @Body() body: SetItemRecipeDto) {
    return this.items.setItemRecipe({
      organizationId: params.organizationId,
      itemId: params.itemId,
      lines: body.lines,
    });
  }

  @Get('showcase-bouquets')
  @ApiOperation({ summary: 'List showcase bouquets with composition preview' })
  listShowcaseBouquets(@Param() params: OrganizationIdParamDto) {
    return this.items.listShowcaseBouquets(params.organizationId);
  }

  @Get('master-data/retail-prices')
  @ApiOperation({ summary: 'List retail prices for a week (flowers + material services)' })
  listRetailPrices(
    @Param() params: OrganizationIdParamDto,
    @Query() query: ListRetailPricesQueryDto,
  ) {
    return this.retailPrices.listRetailPrices(params.organizationId, query.effectiveFrom);
  }

  @Put('master-data/retail-prices')
  @RequirePermissions('master-data:manage')
  @ApiOperation({ summary: 'Upsert retail prices for a week' })
  upsertRetailPrices(
    @Param() params: OrganizationIdParamDto,
    @Body() body: UpsertRetailPricesDto,
  ) {
    return this.retailPrices.upsertRetailPrices({
      organizationId: params.organizationId,
      effectiveFrom: body.effectiveFrom,
      prices: body.prices,
    });
  }

  @Post('master-data/retail-prices/resolve')
  @ApiOperation({ summary: 'Calculate retail total for composition lines' })
  resolveRetailComposition(
    @Param() params: OrganizationIdParamDto,
    @Body() body: ResolveRetailCompositionDto,
  ) {
    return this.retailPrices.resolveCompositionRetail({
      organizationId: params.organizationId,
      date: body.date,
      lines: body.lines,
    });
  }
}
