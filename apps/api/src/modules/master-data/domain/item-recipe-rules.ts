import { DomainError, ItemType, MasterDataStatus, type ItemProps } from './master-data-rules';

export type RecipeLineInput = {
  componentItemId: string;
  quantity: string;
};

export type RecipeComponentInfo = {
  id: string;
  itemType: ItemType;
  status: MasterDataStatus;
};

export function assertRecipeParentSellable(item: Pick<ItemProps, 'isSellable' | 'status'>): void {
  if (item.status === MasterDataStatus.ARCHIVED) {
    throw new DomainError('ITEM_ARCHIVED', 'Archived items cannot have a recipe');
  }
  if (!item.isSellable) {
    throw new DomainError(
      'RECIPE_NOT_SELLABLE',
      'Recipe can only be defined for sellable (ready bouquet) items',
    );
  }
}

export function assertShowcaseFlag(item: Pick<ItemProps, 'isSellable'>, isShowcase: boolean): void {
  if (isShowcase && !item.isSellable) {
    throw new DomainError(
      'SHOWCASE_REQUIRES_SELLABLE',
      'Showcase flag requires the item to be marked as a ready bouquet',
    );
  }
}

export function validateRecipeLines(
  lines: RecipeLineInput[],
  components: Map<string, RecipeComponentInfo>,
): void {
  if (lines.length === 0) {
    return;
  }

  const seen = new Set<string>();
  for (const line of lines) {
    const componentId = line.componentItemId.trim();
    if (!componentId) {
      throw new DomainError('RECIPE_COMPONENT_REQUIRED', 'Recipe line must specify a component item');
    }
    if (seen.has(componentId)) {
      throw new DomainError(
        'RECIPE_DUPLICATE_COMPONENT',
        'Each component can appear only once in a recipe',
      );
    }
    seen.add(componentId);

    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new DomainError('RECIPE_INVALID_QUANTITY', 'Recipe quantity must be positive');
    }

    const component = components.get(componentId);
    if (!component) {
      throw new DomainError('RECIPE_COMPONENT_NOT_FOUND', 'Recipe component item not found');
    }
    if (component.status !== MasterDataStatus.ACTIVE) {
      throw new DomainError('RECIPE_COMPONENT_NOT_ACTIVE', 'Recipe components must be ACTIVE');
    }
    if (component.itemType !== ItemType.FLOWER && component.itemType !== ItemType.MATERIAL) {
      throw new DomainError(
        'RECIPE_INVALID_COMPONENT_TYPE',
        'Recipe components must be flowers or materials',
      );
    }
  }
}

export function assertRecipeNotEmpty(lines: RecipeLineInput[]): void {
  if (lines.length === 0) {
    throw new DomainError('RECIPE_EMPTY', 'Recipe has no composition lines');
  }
}

export function assertTemplateItemEligible(
  item: Pick<ItemProps, 'status' | 'isShowcase' | 'isSellable'>,
): void {
  if (item.status !== MasterDataStatus.ACTIVE) {
    throw new DomainError('TEMPLATE_NOT_ACTIVE', 'Template item must be ACTIVE');
  }
  if (!item.isShowcase && !item.isSellable) {
    throw new DomainError(
      'TEMPLATE_NOT_ELIGIBLE',
      'Template item must be a showcase bouquet or sellable item',
    );
  }
}
