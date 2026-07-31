import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  BouquetCatalogListFilter,
  ItemRecipeLineInput,
  ItemRecipeLineView,
  ItemRecipeRepository,
  ShowcaseBouquetView,
} from '../application/ports/item-recipe.repository';
import { ItemType, MasterDataStatus } from '../domain/master-data-rules';

const PREVIEW_LINE_LIMIT = 3;

function mapLine(row: {
  id: string;
  parentItemId: string;
  componentItemId: string;
  quantity: { toString(): string };
  sortOrder: number;
  componentItem: { name: string; code: string; itemType: string };
}): ItemRecipeLineView {
  return {
    id: row.id,
    parentItemId: row.parentItemId,
    componentItemId: row.componentItemId,
    componentName: row.componentItem.name,
    componentCode: row.componentItem.code,
    componentItemType: row.componentItem.itemType as ItemType,
    quantity: row.quantity.toString(),
    sortOrder: row.sortOrder,
  };
}

@Injectable()
export class PrismaItemRecipeRepository implements ItemRecipeRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async listByParent(organizationId: string, parentItemId: string): Promise<ItemRecipeLineView[]> {
    const rows = await this.client().itemRecipeLine.findMany({
      where: { organizationId, parentItemId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        componentItem: { select: { name: true, code: true, itemType: true } },
      },
    });
    return rows.map(mapLine);
  }

  async replaceAll(
    organizationId: string,
    parentItemId: string,
    lines: ItemRecipeLineInput[],
  ): Promise<ItemRecipeLineView[]> {
    const db = this.client();
    await db.itemRecipeLine.deleteMany({ where: { organizationId, parentItemId } });
    if (lines.length === 0) {
      return [];
    }
    await db.itemRecipeLine.createMany({
      data: lines.map((line) => ({
        id: randomUUID(),
        organizationId,
        parentItemId,
        componentItemId: line.componentItemId,
        quantity: line.quantity,
        sortOrder: line.sortOrder,
      })),
    });
    return this.listByParent(organizationId, parentItemId);
  }

  async listBouquetCatalog(
    organizationId: string,
    filter: BouquetCatalogListFilter = {},
  ): Promise<ShowcaseBouquetView[]> {
    const items = await this.client().item.findMany({
      where: {
        organizationId,
        status: MasterDataStatus.ACTIVE,
        isSellable: true,
        ...(filter.showcaseOnly ? { isShowcase: true } : {}),
      },
      orderBy: [{ isShowcase: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        code: true,
        isShowcase: true,
        recipeAsParent: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            quantity: true,
            componentItem: { select: { name: true } },
          },
        },
      },
    });

    return items.map((item) => {
      const allLines = item.recipeAsParent.map((line) => ({
        componentName: line.componentItem.name,
        quantity: line.quantity.toString(),
      }));
      const previewLines = allLines.slice(0, PREVIEW_LINE_LIMIT);
      const previewMoreCount = Math.max(0, allLines.length - PREVIEW_LINE_LIMIT);
      return {
        id: item.id,
        name: item.name,
        code: item.code,
        isShowcase: item.isShowcase,
        recipeLineCount: allLines.length,
        previewLines,
        previewMoreCount,
      };
    });
  }

  /** @deprecated Use listBouquetCatalog */
  async listShowcaseBouquets(organizationId: string): Promise<ShowcaseBouquetView[]> {
    return this.listBouquetCatalog(organizationId, { showcaseOnly: true });
  }
}
