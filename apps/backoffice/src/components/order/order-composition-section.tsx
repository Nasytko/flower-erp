'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Input } from '@flower/ui';
import { StockShortageAlert } from '@/components/inventory/stock-shortage-alert';
import { getApiClient } from '@/lib/api-client';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { InlineAlert } from '@/components/workspace/workspace-ui';
import {
  buildAvailableStockMap,
  computeReservedShortages,
  computeStockShortages,
  type CompositionNeedLine,
} from '@/lib/order-composition-stock';
import { listAllCatalogItems } from '@/lib/catalog-items';
import { bouquetCatalogHref } from '@/lib/settings-nav';

export type OrderCompositionMode = 'SHOWCASE' | 'CUSTOM';

type CatalogItem = {
  id: string;
  name: string;
  code: string;
  itemType: string;
};

type BouquetOption = {
  id: string;
  name: string;
  code: string;
  recipeLineCount: number;
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
  reservedLines?: Array<{
    itemId: string;
    plannedQuantity: string;
    deficitQuantity?: string;
    item?: { name: string } | null;
  }>;
  autoPickModeOnLoad?: boolean;
  onBouquetOptionsChange?: (options: Array<{ id: string; recipeLineCount: number }>) => void;
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
  autoPickModeOnLoad = false,
  onBouquetOptionsChange,
}: OrderCompositionSectionProps) {
  const [loading, setLoading] = useState(true);
  const [bouquetOptions, setBouquetOptions] = useState<BouquetOption[]>([]);
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [stockByItemId, setStockByItemId] = useState<Map<string, string>>(new Map());
  const [recipeLines, setRecipeLines] = useState<CompositionNeedLine[]>([]);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [modePicked, setModePicked] = useState(false);

  const itemsHref = `/organizations/${organizationId}/master-data/items`;
  const bouquetCatalogLink = bouquetCatalogHref(organizationId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCatalogLoadError(null);
    void (async () => {
      try {
        const client = getApiClient();
        const [stock, bouquetsResult, ingredients] = await Promise.all([
          client.getOperationalStock(organizationId, storeId),
          client.listShowcaseBouquets(organizationId).then(
            (bouquets) => ({ bouquets, error: null as string | null }),
            (err: unknown) => ({
              bouquets: [] as BouquetOption[],
              error:
                err instanceof Error ? err.message : 'Не удалось загрузить каталог букетов',
            }),
          ),
          listAllCatalogItems(client, organizationId, {
            status: 'ACTIVE',
            isSellable: false,
          }),
        ]);
        if (cancelled) return;
        setStockByItemId(buildAvailableStockMap(stock.items));
        setBouquetOptions(bouquetsResult.bouquets);
        onBouquetOptionsChange?.(
          bouquetsResult.bouquets.map((b) => ({ id: b.id, recipeLineCount: b.recipeLineCount })),
        );
        setCatalogLoadError(bouquetsResult.error);
        setCatalog(
          ingredients.filter(
            (item) =>
              !item.isSellable &&
              (item.itemType === 'FLOWER' || item.itemType === 'MATERIAL'),
          ),
        );
        if (autoPickModeOnLoad && bouquetsResult.bouquets[0] && !showcaseBouquetId) {
          onShowcaseBouquetIdChange(bouquetsResult.bouquets[0]!.id);
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
    if (!autoPickModeOnLoad || loading || modePicked) return;
    if (bouquetOptions.length > 0) {
      onModeChange('SHOWCASE');
    } else if (catalog.length > 0) {
      onModeChange('CUSTOM');
    }
    setModePicked(true);
  }, [
    autoPickModeOnLoad,
    loading,
    modePicked,
    bouquetOptions.length,
    catalog.length,
    onModeChange,
  ]);

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

  const selectedBouquet = useMemo(
    () => bouquetOptions.find((item) => item.id === showcaseBouquetId) ?? null,
    [bouquetOptions, showcaseBouquetId],
  );

  const emptyRecipeError =
    mode === 'SHOWCASE' && selectedBouquet && selectedBouquet.recipeLineCount === 0
      ? 'У выбранного букета нет состава — задайте рецепт в каталоге'
      : undefined;
  const bouquetFieldError = showcaseError ?? emptyRecipeError;

  const flowers = useMemo(
    () => catalog.filter((item) => item.itemType === 'FLOWER'),
    [catalog],
  );
  const materials = useMemo(
    () => catalog.filter((item) => item.itemType === 'MATERIAL'),
    [catalog],
  );

  const filterCatalog = (list: CatalogItem[]) => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
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
          <span className="sale-mode__title">Готовый букет</span>
          <span className="sale-mode__hint">Из каталога букетов</span>
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
          <span className="sale-mode__hint">Любые цветы и услуги</span>
        </button>
      </div>

      {previewShortages.length > 0 ? (
        <StockShortageAlert shortages={previewShortages} context="order" />
      ) : null}

      {catalogLoadError ? (
        <InlineAlert tone="warning" title="Каталог букетов недоступен">
          {catalogLoadError}. Проверьте, что на сервере применены миграции БД.
        </InlineAlert>
      ) : null}

      {mode === 'SHOWCASE' ? (
        bouquetOptions.length > 0 ? (
          <>
            <Field label="Букет" required error={bouquetFieldError}>
              <FancySelect
                value={showcaseBouquetId}
                onChange={onShowcaseBouquetIdChange}
                options={bouquetOptions.map((item) => ({
                  value: item.id,
                  label: item.name,
                  hint:
                    item.recipeLineCount === 0
                      ? `${item.code} · без состава`
                      : item.code,
                }))}
                searchable
                placeholder="Выберите букет из каталога"
                disabled={disabled}
              />
            </Field>
            {emptyRecipeError ? (
              <InlineAlert tone="warning" title="Букет без состава">
                Добавьте рецепт в{' '}
                <Link href={bouquetCatalogLink}>каталоге букетов</Link>, иначе заказ не сохранится.
              </InlineAlert>
            ) : null}
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
            ) : selectedBouquet && selectedBouquet.previewLines.length > 0 ? (
              <div className="field__hint">
                {selectedBouquet.previewLines
                  .map((line) => `${line.componentName} × ${line.quantity}`)
                  .join(' · ')}
              </div>
            ) : null}
          </>
        ) : loading ? null : (
          <p className="field__hint">
            Нет букетов в каталоге.{' '}
            <Link href={bouquetCatalogLink}>Добавьте в «Каталог букетов»</Link> или соберите
            заказ вручную через «Собрать» и{' '}
            <Link href={itemsHref}>товары-ингредиенты</Link>.
          </p>
        )
      ) : (
        <>
          {bouquetOptions.length > 0 ? (
            <p className="field__hint">
              Готовые букеты — вкладка{' '}
              <button
                type="button"
                className="text-link"
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  font: 'inherit',
                }}
                onClick={() => onModeChange('SHOWCASE')}
                disabled={disabled}
              >
                «Готовый букет»
              </button>
              .
            </p>
          ) : null}
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
            <p className="sale-cells__empty">
              {loading ? (
                'Загрузка…'
              ) : (
                <>
                  Нет цветов. <Link href={itemsHref}>Добавьте в «Товары»</Link>.
                </>
              )}
            </p>
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
            <p className="sale-cells__empty">
              {loading ? (
                'Загрузка…'
              ) : (
                <>
                  Нет материалов. <Link href={itemsHref}>Добавьте в «Товары»</Link>.
                </>
              )}
            </p>
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

      {loading ? <p className="field__hint">Обновление остатков…</p> : null}
    </div>
  );
}

export { validateShowcaseBouquetSelection } from '@/lib/bouquet-composition-match';

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
