'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { InlineAlert } from '@/components/workspace/workspace-ui';
import {
  buildAvailableStockMap,
  computeReservedShortages,
  computeStockShortages,
  type CompositionNeedLine,
  type StockShortage,
} from '@/lib/order-composition-stock';

export type OrderCompositionMode = 'SHOWCASE' | 'CUSTOM';

type CatalogItem = {
  id: string;
  name: string;
  code: string;
  itemType: string;
};

type ShowcaseBouquet = {
  id: string;
  name: string;
  code: string;
  previewLines: Array<{ componentName: string; quantity: string }>;
  previewMoreCount: number;
};

function QtyStepper({
  value,
  onDecrease,
  onIncrease,
  disabled,
  stepLabel,
}: {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  disabled?: boolean;
  stepLabel?: string;
}) {
  return (
    <div className="sale-qty">
      <button
        type="button"
        className="sale-qty__btn"
        onClick={onDecrease}
        disabled={disabled || value <= 0}
        aria-label={stepLabel ? `Убрать ${stepLabel}` : 'Уменьшить'}
      >
        {stepLabel ? `−${stepLabel}` : '−'}
      </button>
      <span className="sale-qty__value" aria-live="polite">
        {stepLabel && value > 0 ? `${value} (${stepLabel})` : value}
      </span>
      <button
        type="button"
        className="sale-qty__btn"
        onClick={onIncrease}
        disabled={disabled}
        aria-label={stepLabel ? `Добавить ${stepLabel}` : 'Увеличить'}
      >
        {stepLabel ? `+${stepLabel}` : '+'}
      </button>
    </div>
  );
}

function StockShortageAlert({ shortages }: { shortages: StockShortage[] }) {
  if (shortages.length === 0) return null;
  return (
    <InlineAlert tone="warning" title="Не хватает на складе">
      <p className="field__hint" style={{ margin: '0 0 8px' }}>
        Заказ можно сохранить — нехватка будет видна в этом блоке.
      </p>
      <ul className="form-checklist">
        {shortages.map((row) => (
          <li key={row.itemId}>
            <strong>{row.name}</strong>: нужно {row.needed}, доступно {row.available}
            {row.missing ? ` (не хватает ${row.missing})` : null}
          </li>
        ))}
      </ul>
    </InlineAlert>
  );
}

export type OrderCompositionSectionProps = {
  organizationId: string;
  storeId: string;
  mode: OrderCompositionMode;
  onModeChange: (mode: OrderCompositionMode) => void;
  showcaseBouquetId: string;
  onShowcaseBouquetIdChange: (id: string) => void;
  customQtyByItem: Map<string, number>;
  onCustomQtyChange: (itemId: string, qty: number) => void;
  disabled?: boolean;
  showcaseError?: string;
  /** When editing an existing order — reserved deficit from API. */
  reservedLines?: Array<{
    itemId: string;
    plannedQuantity: string;
    deficitQuantity?: string;
    item?: { name: string } | null;
  }>;
};

export function OrderCompositionSection({
  organizationId,
  storeId,
  mode,
  onModeChange,
  showcaseBouquetId,
  onShowcaseBouquetIdChange,
  customQtyByItem,
  onCustomQtyChange,
  disabled = false,
  showcaseError,
  reservedLines,
}: OrderCompositionSectionProps) {
  const [loading, setLoading] = useState(true);
  const [showcaseBouquets, setShowcaseBouquets] = useState<ShowcaseBouquet[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [stockByItemId, setStockByItemId] = useState<Map<string, string>>(new Map());
  const [recipeLines, setRecipeLines] = useState<CompositionNeedLine[]>([]);
  const [catalogQuery, setCatalogQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const client = getApiClient();
        const [stock, bouquets, items] = await Promise.all([
          client.getOperationalStock(organizationId, storeId),
          client.listShowcaseBouquets(organizationId).catch(() => [] as ShowcaseBouquet[]),
          client.listItems(organizationId, { pageSize: 500, status: 'ACTIVE' }),
        ]);
        if (cancelled) return;
        setStockByItemId(buildAvailableStockMap(stock.items));
        setShowcaseBouquets(bouquets);
        setCatalog(
          items.items.filter(
            (item) => item.itemType === 'FLOWER' || item.itemType === 'MATERIAL',
          ),
        );
        if (bouquets[0] && !showcaseBouquetId) {
          onShowcaseBouquetIdChange(bouquets[0]!.id);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId]);

  useEffect(() => {
    if (mode !== 'SHOWCASE' || !showcaseBouquetId) {
      setRecipeLines([]);
      return;
    }
    let cancelled = false;
    void getApiClient()
      .getItemRecipe(organizationId, showcaseBouquetId)
      .then((recipe) => {
        if (cancelled) return;
        setRecipeLines(
          recipe.lines.map((line) => ({
            itemId: line.componentItemId,
            name: line.componentName,
            quantity: line.quantity,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setRecipeLines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, mode, showcaseBouquetId]);

  const selectedShowcase = useMemo(
    () => showcaseBouquets.find((item) => item.id === showcaseBouquetId) ?? null,
    [showcaseBouquets, showcaseBouquetId],
  );

  const flowers = useMemo(
    () => catalog.filter((item) => item.itemType === 'FLOWER'),
    [catalog],
  );
  const materials = useMemo(
    () => catalog.filter((item) => item.itemType === 'MATERIAL'),
    [catalog],
  );

  const filterCatalog = (items: CatalogItem[]) => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q),
    );
  };

  const customNeedLines = useMemo(() => {
    const lines: CompositionNeedLine[] = [];
    for (const item of catalog) {
      const qty = customQtyByItem.get(item.id) ?? 0;
      if (qty <= 0) continue;
      lines.push({ itemId: item.id, name: item.name, quantity: String(qty) });
    }
    return lines;
  }, [catalog, customQtyByItem]);

  const previewShortages = useMemo(() => {
    const needs = mode === 'SHOWCASE' ? recipeLines : customNeedLines;
    const preview = computeStockShortages(needs, stockByItemId);
    if (preview.length > 0 || !reservedLines?.length || !disabled) {
      return preview;
    }
    return computeReservedShortages(reservedLines);
  }, [mode, recipeLines, customNeedLines, stockByItemId, reservedLines, disabled]);

  function bumpCustomQty(itemId: string, delta: number) {
    const next = Math.max(0, (customQtyByItem.get(itemId) ?? 0) + delta);
    onCustomQtyChange(itemId, next);
  }

  return (
    <div className="stack-form order-composition-section">
      <div className="sale-mode" role="tablist" aria-label="Состав заказа">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'SHOWCASE'}
          className={`sale-mode__card${mode === 'SHOWCASE' ? ' sale-mode__card--active' : ''}`}
          onClick={() => onModeChange('SHOWCASE')}
          disabled={disabled}
        >
          <span className="sale-mode__title">Букет с витрины</span>
          <span className="sale-mode__hint">Готовый рецепт</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'CUSTOM'}
          className={`sale-mode__card${mode === 'CUSTOM' ? ' sale-mode__card--active' : ''}`}
          onClick={() => onModeChange('CUSTOM')}
          disabled={disabled}
        >
          <span className="sale-mode__title">Собрать</span>
          <span className="sale-mode__hint">Цветы и доп. услуги</span>
        </button>
      </div>

      {mode === 'SHOWCASE' ? (
        showcaseBouquets.length > 0 ? (
          <>
            <Field label="Букет" required error={showcaseError}>
              <FancySelect
                value={showcaseBouquetId}
                onChange={onShowcaseBouquetIdChange}
                options={showcaseBouquets.map((item) => ({
                  value: item.id,
                  label: item.name,
                  hint: item.code,
                }))}
                searchable
                placeholder="Выберите букет"
                disabled={disabled}
              />
            </Field>
            {recipeLines.length > 0 ? (
              <ul className="order-composition-preview">
                {recipeLines.map((line) => {
                  const shortage = previewShortages.find((row) => row.itemId === line.itemId);
                  return (
                    <li
                      key={line.itemId}
                      className={shortage ? 'order-composition-preview__line--short' : undefined}
                    >
                      {line.name} × {line.quantity}
                      {shortage ? (
                        <span className="order-composition-preview__short">
                          {' '}
                          (доступно {shortage.available})
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : selectedShowcase && selectedShowcase.previewLines.length > 0 ? (
              <div className="field__hint">
                {selectedShowcase.previewLines
                  .map((line) => `${line.componentName} × ${line.quantity}`)
                  .join(' · ')}
              </div>
            ) : null}
          </>
        ) : (
          <p className="field__hint">
            Нет букетов на витрине.{' '}
            <Link href={`/organizations/${organizationId}/master-data/showcase-bouquets`}>
              Добавьте в справочнике
            </Link>
            .
          </p>
        )
      ) : (
        <>
          <Field label="Поиск">
            <Input
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Название или код…"
              disabled={disabled}
            />
          </Field>
          <h4 className="order-composition-section__heading">Цветы</h4>
          {filterCatalog(flowers).length === 0 ? (
            <p className="sale-cells__empty">Нет цветов в справочнике</p>
          ) : (
            <div className="sale-cells" role="list">
              {filterCatalog(flowers).map((item) => {
                const qty = customQtyByItem.get(item.id) ?? 0;
                const shortage = previewShortages.find((row) => row.itemId === item.id);
                return (
                  <div
                    key={item.id}
                    role="listitem"
                    className={`sale-cell${qty > 0 ? ' sale-cell--active' : ''}${shortage ? ' sale-cell--short' : ''}`}
                  >
                    <div className="sale-cell__top">
                      <strong className="sale-cell__name">{item.name}</strong>
                      <span className="sale-cell__meta">{item.code}</span>
                      {shortage ? (
                        <span className="sale-cell__meta sale-cell__meta--warn">
                          доступно {shortage.available}
                        </span>
                      ) : null}
                    </div>
                    <QtyStepper
                      value={qty}
                      disabled={disabled}
                      onDecrease={() => bumpCustomQty(item.id, -1)}
                      onIncrease={() => bumpCustomQty(item.id, 1)}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <h4 className="order-composition-section__heading">Доп. услуги (+1)</h4>
          {filterCatalog(materials).length === 0 ? (
            <p className="sale-cells__empty">Нет материалов в справочнике</p>
          ) : (
            <div className="sale-cells" role="list">
              {filterCatalog(materials).map((item) => {
                const qty = customQtyByItem.get(item.id) ?? 0;
                const shortage = previewShortages.find((row) => row.itemId === item.id);
                return (
                  <div
                    key={item.id}
                    role="listitem"
                    className={`sale-cell${qty > 0 ? ' sale-cell--active' : ''}${shortage ? ' sale-cell--short' : ''}`}
                  >
                    <div className="sale-cell__top">
                      <strong className="sale-cell__name">{item.name}</strong>
                      <span className="sale-cell__meta">+1 · {item.code}</span>
                      {shortage ? (
                        <span className="sale-cell__meta sale-cell__meta--warn">
                          доступно {shortage.available}
                        </span>
                      ) : null}
                    </div>
                    <QtyStepper
                      value={qty}
                      disabled={disabled}
                      stepLabel="+1"
                      onDecrease={() => bumpCustomQty(item.id, -1)}
                      onIncrease={() => bumpCustomQty(item.id, 1)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <StockShortageAlert shortages={previewShortages} />
      {loading ? <p className="field__hint">Обновление остатков…</p> : null}
    </div>
  );
}

/** Build API payload from custom picker state. */
export function customCompositionItemsFromMap(
  customQtyByItem: Map<string, number>,
): Array<{ itemId: string; plannedQuantity: string; sortOrder: number }> {
  let sortOrder = 0;
  return [...customQtyByItem.entries()]
    .filter(([, qty]) => qty > 0)
    .map(([itemId, qty]) => ({
      itemId,
      plannedQuantity: String(qty),
      sortOrder: sortOrder++,
    }));
}
