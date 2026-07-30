import type { ItemType } from '../../domain/master-data-rules';

export const ITEM_RECIPE_REPOSITORY = Symbol('ITEM_RECIPE_REPOSITORY');

export type ItemRecipeLineView = {
  id: string;
  parentItemId: string;
  componentItemId: string;
  componentName: string;
  componentCode: string;
  componentItemType: ItemType;
  quantity: string;
  sortOrder: number;
};

export type ItemRecipeLineInput = {
  componentItemId: string;
  quantity: string;
  sortOrder: number;
};

export type ShowcaseBouquetPreviewLine = {
  componentName: string;
  quantity: string;
};

export type ShowcaseBouquetView = {
  id: string;
  name: string;
  code: string;
  previewLines: ShowcaseBouquetPreviewLine[];
  previewMoreCount: number;
};

export interface ItemRecipeRepository {
  listByParent(organizationId: string, parentItemId: string): Promise<ItemRecipeLineView[]>;
  replaceAll(
    organizationId: string,
    parentItemId: string,
    lines: ItemRecipeLineInput[],
  ): Promise<ItemRecipeLineView[]>;
  listShowcaseBouquets(organizationId: string): Promise<ShowcaseBouquetView[]>;
}
