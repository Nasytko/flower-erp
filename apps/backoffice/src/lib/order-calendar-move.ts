import type { ApiClient } from '@flower/api-client';
import type { OrderBoardCardDto, OrderBoardColumn } from '@flower/api-client';
import { ORDER_BOARD_COLUMNS } from '@/lib/order-calendar-labels';

export type CalendarMoveContext = {
  organizationId: string;
  storeId: string;
  card: OrderBoardCardDto;
  fromColumn: OrderBoardColumn;
  toColumn: OrderBoardColumn;
};

export function canDropCardOnColumn(
  fromColumn: OrderBoardColumn,
  toColumn: OrderBoardColumn,
  card: OrderBoardCardDto,
): boolean {
  if (fromColumn === toColumn) return false;

  const fromIdx = ORDER_BOARD_COLUMNS.indexOf(fromColumn);
  const toIdx = ORDER_BOARD_COLUMNS.indexOf(toColumn);
  if (fromIdx < 0 || toIdx < 0) return false;

  if (toColumn === 'WITH_COURIER' && card.type !== 'DELIVERY') return false;

  if (fromColumn === 'READY' && toColumn === 'HANDED_OFF' && card.type === 'PICKUP') {
    return true;
  }

  return toIdx === fromIdx + 1;
}

export function calendarMoveLabel(
  fromColumn: OrderBoardColumn,
  toColumn: OrderBoardColumn,
  card: OrderBoardCardDto,
): string {
  if (fromColumn === 'NEW' && toColumn === 'IN_WORK') return 'Взять в работу';
  if (fromColumn === 'IN_WORK' && toColumn === 'READY') return 'Отметить готовым';
  if (fromColumn === 'READY' && toColumn === 'WITH_COURIER') return 'Передать курьеру';
  if (fromColumn === 'READY' && toColumn === 'HANDED_OFF') {
    return card.type === 'DELIVERY' ? 'Завершить доставку' : 'Завершить заказ';
  }
  if (fromColumn === 'WITH_COURIER' && toColumn === 'HANDED_OFF') return 'Доставлен';
  return 'Переместить';
}

async function deliveryVersion(
  client: ApiClient,
  organizationId: string,
  storeId: string,
  deliveryId: string,
): Promise<number> {
  const delivery = await client.getDelivery(organizationId, storeId, deliveryId);
  return delivery.version;
}

export async function executeCalendarMove(
  client: ApiClient,
  ctx: CalendarMoveContext,
): Promise<void> {
  const { organizationId, storeId, card, fromColumn, toColumn } = ctx;
  const orderId = card.id;

  if (fromColumn === 'NEW' && toColumn === 'IN_WORK') {
    await client.claimOrder(organizationId, storeId, orderId);
    try {
      await client.startOrderPreparation(organizationId, storeId, orderId);
    } catch {
      // Claim alone moves card to «В сборке» when prep preconditions are not met.
    }
    return;
  }

  if (fromColumn === 'IN_WORK' && toColumn === 'READY') {
    if (card.status !== 'IN_PREPARATION') {
      try {
        await client.startOrderPreparation(organizationId, storeId, orderId);
      } catch {
        // May already be reserved/assigned on a different path.
      }
    }
    await client.markOrderReady(organizationId, storeId, orderId);
    return;
  }

  if (fromColumn === 'READY' && toColumn === 'WITH_COURIER') {
    if (!card.deliveryId) throw new Error('У заказа нет доставки');
    const deliveryId = card.deliveryId;
    let version = await deliveryVersion(client, organizationId, storeId, deliveryId);
    const status = card.deliveryStatus;
    if (status === 'PLANNED' || status === 'DRAFT') {
      const updated = await client.markDeliveryReadyForDispatch(organizationId, storeId, deliveryId, {
        expectedVersion: version,
      });
      version = updated.version;
    }
    if (
      status === 'READY_FOR_DISPATCH' ||
      status === 'ASSIGNED' ||
      status === 'PLANNED' ||
      status === 'DRAFT'
    ) {
      await client.startDeliveryTransit(organizationId, storeId, deliveryId, {
        expectedVersion: version,
      });
    }
    return;
  }

  if (toColumn === 'HANDED_OFF') {
    if (card.type === 'DELIVERY') {
      if (!card.deliveryId) throw new Error('У заказа нет доставки');
      const version = await deliveryVersion(client, organizationId, storeId, card.deliveryId);
      await client.markDeliveryDelivered(organizationId, storeId, card.deliveryId, {
        expectedVersion: version,
      });
    } else {
      await client.completeOrder(organizationId, storeId, orderId);
    }
  }
}

export function canDragCard(
  column: OrderBoardColumn,
  permissions: {
    canAssign: boolean;
    canPrepare: boolean;
    canDelivery: boolean;
  },
): boolean {
  switch (column) {
    case 'NEW':
      return permissions.canAssign;
    case 'IN_WORK':
      return permissions.canPrepare;
    case 'READY':
      return permissions.canPrepare || permissions.canDelivery;
    case 'WITH_COURIER':
      return permissions.canDelivery;
    default:
      return false;
  }
}
