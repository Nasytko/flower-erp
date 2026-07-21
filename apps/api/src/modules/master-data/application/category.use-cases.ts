import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import { ITEM_CATEGORY_REPOSITORY, type ItemCategoryRepository } from './ports/repositories';
import {
  MasterDataStatus,
  assertCanArchiveCategory,
  assertCategoryNoCycle,
  assertEntityName,
  normalizeMasterCode,
  type ItemCategoryProps,
} from '../domain/master-data-rules';
import { mapDomainError } from './map-domain-error';

@Injectable()
export class CategoryUseCases {
  constructor(
    @Inject(ITEM_CATEGORY_REPOSITORY) private readonly categories: ItemCategoryRepository,
    private readonly organizations: OrganizationUseCases,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async createCategory(input: {
    organizationId: string;
    name: string;
    code: string;
    parentId?: string | null;
  }): Promise<ItemCategoryProps> {
    try {
      await this.organizations.getOrganization(input.organizationId);
      const name = assertEntityName(input.name, 'CATEGORY');
      const code = normalizeMasterCode(input.code, 'CATEGORY');
      const parentId = input.parentId ?? null;
      const ctx = getRequestContext();

      return await this.uow.runInTransaction(async () => {
        if (await this.categories.existsCode(input.organizationId, code)) {
          throw new ConflictException({
            code: 'CATEGORY_CODE_TAKEN',
            message: 'Category code already exists in this organization',
          });
        }

        if (parentId) {
          const parent = await this.categories.findById(input.organizationId, parentId);
          if (!parent) {
            throw new NotFoundException({
              code: 'CATEGORY_PARENT_NOT_FOUND',
              message: 'Parent category not found in this organization',
            });
          }
        }

        const id = randomUUID();
        await assertCategoryNoCycle(id, parentId, (lookupId) =>
          this.categories.getParentId(input.organizationId, lookupId),
        );

        const category = await this.categories.create({
          id,
          organizationId: input.organizationId,
          name,
          code,
          parentId,
          status: MasterDataStatus.ACTIVE,
        });

        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'item_category.created',
          entityType: 'ItemCategory',
          entityId: category.id,
          afterState: {
            name: category.name,
            code: category.code,
            parentId: category.parentId,
            status: category.status,
          },
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });

        return category;
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      mapDomainError(error);
    }
  }

  async getCategory(organizationId: string, categoryId: string): Promise<ItemCategoryProps> {
    const category = await this.categories.findById(organizationId, categoryId);
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Category not found in this organization',
      });
    }
    return category;
  }

  async listCategories(organizationId: string, page: number, pageSize: number) {
    await this.organizations.getOrganization(organizationId);
    return this.categories.list(organizationId, { page, pageSize });
  }

  async archiveCategory(input: {
    organizationId: string;
    categoryId: string;
    reason?: string;
  }): Promise<ItemCategoryProps> {
    try {
      const ctx = getRequestContext();
      return await this.uow.runInTransaction(async () => {
        const category = await this.categories.findById(input.organizationId, input.categoryId);
        if (!category) {
          throw new NotFoundException({
            code: 'CATEGORY_NOT_FOUND',
            message: 'Category not found in this organization',
          });
        }
        const [childCount, itemCount] = await Promise.all([
          this.categories.countChildren(input.organizationId, input.categoryId),
          this.categories.countItems(input.organizationId, input.categoryId),
        ]);
        assertCanArchiveCategory({ status: category.status, childCount, itemCount });

        const updated = await this.categories.updateStatus(
          input.organizationId,
          input.categoryId,
          MasterDataStatus.ARCHIVED,
        );
        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'item_category.archived',
          entityType: 'ItemCategory',
          entityId: category.id,
          beforeState: { status: category.status },
          afterState: { status: updated.status },
          reason: input.reason ?? null,
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      mapDomainError(error);
    }
  }
}
