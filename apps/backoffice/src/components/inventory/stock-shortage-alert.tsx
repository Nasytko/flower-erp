'use client';

import { InlineAlert } from '@/components/workspace/workspace-ui';
import type { StockShortage } from '@/lib/order-composition-stock';

type StockShortageAlertProps = {
  shortages: StockShortage[];
  /** order — saving allowed; sale — completing allowed with warning */
  context?: 'order' | 'sale';
};

export function StockShortageAlert({
  shortages,
  context = 'order',
}: StockShortageAlertProps) {
  if (shortages.length === 0) return null;

  const hint =
    context === 'sale'
      ? 'Продажу можно оформить — проверьте поступление или состав.'
      : 'Заказ можно сохранить — нехватка отображается здесь и на позициях.';

  return (
    <InlineAlert tone="warning" title="Не хватает на складе">
      <p className="field__hint" style={{ margin: '0 0 8px' }}>
        {hint}
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
