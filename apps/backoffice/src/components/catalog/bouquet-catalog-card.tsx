'use client';

import type { ReactNode } from 'react';
import type { RecipeCatalogItem } from '@/components/catalog/item-recipe-editor';
import { ItemRecipeEditor } from '@/components/catalog/item-recipe-editor';

export type BouquetCatalogEntry = {
  id: string;
  name: string;
  code: string;
  isShowcase?: boolean;
  recipeLineCount: number;
  previewLines: Array<{ componentName: string; quantity: string }>;
  previewMoreCount: number;
};

type BouquetCatalogCardProps = {
  bouquet: BouquetCatalogEntry;
  expanded: boolean;
  onToggle: () => void;
  canEdit: boolean;
  organizationId: string;
  catalog: RecipeCatalogItem[];
  onRecipeSaved: () => void;
};

function RecipePreview({ bouquet }: { bouquet: BouquetCatalogEntry }) {
  if (bouquet.recipeLineCount === 0) {
    return (
      <p className="bouquet-catalog-card__empty-recipe">
        Состав не задан — раскройте карточку и добавьте цветы и материалы
      </p>
    );
  }

  return (
    <ul className="bouquet-catalog-card__chips" aria-label="Состав букета">
      {bouquet.previewLines.map((line) => (
        <li key={`${line.componentName}-${line.quantity}`} className="bouquet-catalog-card__chip">
          {line.componentName}
          <span className="bouquet-catalog-card__chip-qty">× {line.quantity}</span>
        </li>
      ))}
      {bouquet.previewMoreCount > 0 ? (
        <li className="bouquet-catalog-card__chip bouquet-catalog-card__chip--more">
          +{bouquet.previewMoreCount}
        </li>
      ) : null}
    </ul>
  );
}

export function BouquetCatalogCard({
  bouquet,
  expanded,
  onToggle,
  canEdit,
  organizationId,
  catalog,
  onRecipeSaved,
}: BouquetCatalogCardProps) {
  const accent = bouquet.recipeLineCount > 0 ? 'showcase' : 'catalog';

  return (
    <article
      className={`bouquet-catalog-card bouquet-catalog-card--${accent}${expanded ? ' bouquet-catalog-card--expanded' : ''}`}
    >
      <div className="bouquet-catalog-card__header">
        <button
          type="button"
          className="bouquet-catalog-card__toggle"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span
            className={`bouquet-catalog-card__chevron${expanded ? ' bouquet-catalog-card__chevron--open' : ''}`}
            aria-hidden
          >
            ▼
          </span>
          <span className="bouquet-catalog-card__title-wrap">
            <span className="bouquet-catalog-card__title">{bouquet.name}</span>
            <span className="bouquet-catalog-card__code">{bouquet.code}</span>
          </span>
        </button>
        {bouquet.recipeLineCount === 0 ? (
          <span className="bouquet-catalog-card__badge">Без состава</span>
        ) : null}
      </div>

      <div className="bouquet-catalog-card__preview">
        <RecipePreview bouquet={bouquet} />
        <p className="bouquet-catalog-card__meta">
          {bouquet.recipeLineCount > 0
            ? `${bouquet.recipeLineCount} ${bouquet.recipeLineCount === 1 ? 'позиция' : bouquet.recipeLineCount < 5 ? 'позиции' : 'позиций'} в составе`
            : 'Доступен в заказах и продаже'}
        </p>
      </div>

      {expanded ? (
        <div className="bouquet-catalog-card__body">
          {canEdit ? (
            <div className="bouquet-catalog-card__panel">
              <h4 className="bouquet-catalog-card__panel-title">Состав букета</h4>
              <ItemRecipeEditor
                organizationId={organizationId}
                itemId={bouquet.id}
                catalog={catalog}
                canEdit={canEdit}
                onSaved={onRecipeSaved}
              />
            </div>
          ) : (
            <RecipePreview bouquet={bouquet} />
          )}
        </div>
      ) : null}
    </article>
  );
}

export function BouquetCatalogStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="bouquet-catalog-stat">
      <span className="bouquet-catalog-stat__label">{label}</span>
      <strong className="bouquet-catalog-stat__value">{value}</strong>
      {hint ? <span className="bouquet-catalog-stat__hint">{hint}</span> : null}
    </div>
  );
}
