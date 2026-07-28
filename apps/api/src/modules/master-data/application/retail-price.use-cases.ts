import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import {
  calculateRetailLineTotal,
  defaultRetailPricingMode,
  DomainError,
  ItemType,
  MasterDataStatus,
  assertRetailAmount,
} from '../domain/master-data-rules';
import { ItemUseCases } from './item.use-cases';
import {
  ITEM_RETAIL_PRICE_REPOSITORY,
  type ItemRetailPriceRepository,
} from './ports/item-retail-price.repository';

function actorMembershipId(): string | null {
  return getRequestContext()?.auth?.membershipId ?? null;
}

function parseDateOnly(value: string): Date {
  const d = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException({ code: 'INVALID_DATE', message: 'Invalid date' });
  }
  return d;
}

function domain(error: unknown): never {
  if (error instanceof DomainError) {
    throw new BadRequestException({ code: error.code, message: error.message });
  }
  throw error;
}

@Injectable()
export class RetailPriceUseCases {
  constructor(
    @Inject(ITEM_RETAIL_PRICE_REPOSITORY)
    private readonly retailPrices: ItemRetailPriceRepository,
    private readonly items: ItemUseCases,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async listRetailPrices(organizationId: string, effectiveFrom: string) {
    try {
      const weekStart = parseDateOnly(effectiveFrom);
      const saved = await this.retailPrices.listForWeek(organizationId, weekStart);
      const savedByItem = new Map(saved.map((row) => [row.itemId, row]));

      const catalog = await this.items.listItems(organizationId, 1, 500, {
        status: MasterDataStatus.ACTIVE,
      });

      const flowers = catalog.items
        .filter((item) => item.itemType === ItemType.FLOWER)
        .map((item) => mapCatalogRow(item, savedByItem.get(item.id), weekStart));
      const materials = catalog.items
        .filter((item) => item.itemType === ItemType.MATERIAL)
        .map((item) => mapCatalogRow(item, savedByItem.get(item.id), weekStart));

      return {
        effectiveFrom: weekStart.toISOString().slice(0, 10),
        flowers,
        materials,
      };
    } catch (error) {
      domain(error);
    }
  }

  async upsertRetailPrices(input: {
    organizationId: string;
    effectiveFrom: string;
    prices: Array<{ itemId: string; amount: string }>;
  }) {
    try {
      const weekStart = parseDateOnly(input.effectiveFrom);
      return await this.uow.runInTransaction(async () => {
        const results = [];
        for (const entry of input.prices) {
          if (!entry.amount.trim()) continue;
          assertRetailAmount(entry.amount);
          const item = await this.items.getItem(input.organizationId, entry.itemId);
          if (item.status !== MasterDataStatus.ACTIVE) {
            throw new BadRequestException({
              code: 'ITEM_NOT_ACTIVE',
              message: 'Retail price can be set only for active items',
            });
          }
          const row = await this.retailPrices.upsert({
            id: randomUUID(),
            organizationId: input.organizationId,
            itemId: item.id,
            effectiveFrom: weekStart,
            amount: Number(entry.amount).toFixed(2),
            pricingMode: defaultRetailPricingMode(item.itemType),
            createdByMembershipId: actorMembershipId(),
          });
          results.push(row);
        }
        return { effectiveFrom: weekStart.toISOString().slice(0, 10), updated: results.length };
      });
    } catch (error) {
      domain(error);
    }
  }

  async resolveCompositionRetail(input: {
    organizationId: string;
    date?: string;
    lines: Array<{ itemId: string; quantity: string }>;
  }) {
    try {
      if (!input.lines.length) {
        return { total: '0.00', flowersTotal: '0.00', materialsTotal: '0.00', lines: [] };
      }

      const asOf = input.date ? parseDateOnly(input.date) : dateOnlyFromClock(this.clock);
      const itemIds = [...new Set(input.lines.map((line) => line.itemId))];
      const resolved = await this.retailPrices.resolveForItems(
        input.organizationId,
        itemIds,
        asOf,
      );
      const priceByItem = new Map(resolved.map((row) => [row.itemId, row]));

      let flowersTotal = 0;
      let materialsTotal = 0;
      const lines = input.lines.map((line) => {
        const price = priceByItem.get(line.itemId);
        if (!price) {
          return {
            itemId: line.itemId,
            quantity: line.quantity,
            itemType: null,
            itemName: null,
            unitAmount: null,
            pricingMode: null,
            lineTotal: null,
            missingPrice: true,
          };
        }
        const lineTotal = calculateRetailLineTotal(
          price.amount,
          price.pricingMode,
          line.quantity,
        );
        const totalNum = Number(lineTotal);
        if (price.itemType === ItemType.FLOWER) flowersTotal += totalNum;
        else materialsTotal += totalNum;
        return {
          itemId: line.itemId,
          quantity: line.quantity,
          itemType: price.itemType,
          itemName: price.itemName,
          itemCode: price.itemCode,
          unitAmount: price.amount,
          pricingMode: price.pricingMode,
          lineTotal,
          missingPrice: false,
        };
      });

      const total = (flowersTotal + materialsTotal).toFixed(2);
      return {
        total,
        flowersTotal: flowersTotal.toFixed(2),
        materialsTotal: materialsTotal.toFixed(2),
        lines,
      };
    } catch (error) {
      domain(error);
    }
  }
}

function dateOnlyFromClock(clock: ClockPort): Date {
  const now = clock.now();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function mapCatalogRow(
  item: {
    id: string;
    name: string;
    code: string;
    itemType: ItemType;
    status: MasterDataStatus;
  },
  saved:
    | {
        amount: string;
        pricingMode: string;
        effectiveFrom: Date;
      }
    | undefined,
  weekStart: Date,
) {
  return {
    itemId: item.id,
    name: item.name,
    code: item.code,
    itemType: item.itemType,
    pricingMode: defaultRetailPricingMode(item.itemType),
    amount: saved?.amount ?? null,
    effectiveFrom: saved?.effectiveFrom.toISOString().slice(0, 10) ?? weekStart.toISOString().slice(0, 10),
    isSet: Boolean(saved),
  };
}
