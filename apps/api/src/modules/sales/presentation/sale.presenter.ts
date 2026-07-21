import type { SaleConsumptionView, SaleView } from '../application/ports/sale.repository';

type PresentedSale = Omit<
  SaleView,
  'costAmount' | 'grossProfitAmount' | 'marginPercent' | 'consumption'
> & {
  costAmount?: string | null;
  grossProfitAmount?: string | null;
  marginPercent?: string | null;
  consumption?: PresentedConsumption | null;
};

type PresentedConsumption = Omit<SaleConsumptionView, 'lines'> & {
  lines: Array<
    Omit<SaleConsumptionView['lines'][number], 'costAmount'> & { costAmount?: string }
  >;
};

export function presentSale(
  sale: SaleView,
  opts: { canViewCost: boolean; canViewMargin: boolean },
): PresentedSale {
  const result: PresentedSale = {
    ...sale,
    consumption: sale.consumption
      ? presentConsumption(sale.consumption, opts.canViewCost)
      : null,
  };

  if (!opts.canViewCost) {
    delete result.costAmount;
  }

  if (!opts.canViewMargin) {
    delete result.grossProfitAmount;
    delete result.marginPercent;
  }

  return result;
}

export function presentConsumption(
  consumption: SaleConsumptionView,
  canViewCost: boolean,
): PresentedConsumption {
  if (canViewCost) return consumption;
  return {
    ...consumption,
    lines: consumption.lines.map((line) => {
      const { costAmount: _removed, ...rest } = line;
      return rest;
    }),
  };
}
