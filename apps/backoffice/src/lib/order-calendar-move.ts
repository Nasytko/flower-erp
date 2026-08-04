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

const RESERVABLE_STATUSES = new Set(['CONFIRMED', 'PARTIALLY_RESERVED']);
const PREPARATION_START_STATUSES = new Set(['RESERVED', 'PARTIALLY_RESERVED']);

const CALENDAR_RELEASE_REASON = 'Возврат в колонку «Новые» через календарь';
const CALENDAR_ROLLBACK_REASON = 'Откат назначения после ошибки календаря';

async function rollbackClaim(
  client: ApiClient,
  organizationId: string,
  storeId: string,
  orderId: string,
): Promise<void> {
  try {
    await client.releaseAssignment(organizationId, storeId, orderId, {
      reason: CALENDAR_ROLLBACK_REASON,
    });
  } catch {
    // Best-effort rollback — original error is more important for the user.
  }
}

/** Reserve stock (if needed) and move order to IN_PREPARATION. */
export async function ensureOrderInPreparation(
  client: ApiClient,
  organizationId: string,
  storeId: string,
  orderId: string,
  status: string,
): Promise<void> {
  let currentStatus = status;

  if (currentStatus === 'IN_PREPARATION') return;

  if (RESERVABLE_STATUSES.has(currentStatus)) {
    const reserved = await client.reserveOrder(organizationId, storeId, orderId);
    currentStatus = reserved.status;
  }

  if (PREPARATION_START_STATUSES.has(currentStatus)) {
    await client.startOrderPreparation(organizationId, storeId, orderId);
    return;
  }

  if (currentStatus === 'IN_PREPARATION') return;

  throw new Error(
    'Не удалось начать сборку: заказ должен быть зарезервирован на складе (статус RESERVED)',
  );
}

/** Reserve before claim so a failed reservation does not leave a stray assignment. */
async function moveOrderToInWork(
  client: ApiClient,
  organizationId: string,
  storeId: string,
  orderId: string,
  status: string,
): Promise<void> {
  let currentStatus = status;

  if (RESERVABLE_STATUSES.has(currentStatus)) {
    const reserved = await client.reserveOrder(organizationId, storeId, orderId);
    currentStatus = reserved.status;
  }

  if (currentStatus === 'IN_PREPARATION') {
    await client.claimOrder(organizationId, storeId, orderId);
    return;
  }

  await client.claimOrder(organizationId, storeId, orderId);

  if (PREPARATION_START_STATUSES.has(currentStatus)) {
    try {
      await client.startOrderPreparation(organizationId, storeId, orderId);
    } catch (error) {
      await rollbackClaim(client, organizationId, storeId, orderId);
      throw error;
    }
    return;
  }

  if (currentStatus === 'IN_PREPARATION') return;

  await rollbackClaim(client, organizationId, storeId, orderId);
  throw new Error(
    'Не удалось начать сборку: заказ должен быть зарезервирован на складе (статус RESERVED)',
  );
}

export function canDropCardOnColumn(
  fromColumn: OrderBoardColumn,
  toColumn: OrderBoardColumn,
  card: OrderBoardCardDto,
): boolean {
  if (fromColumn === 'CANCELLED' || toColumn === 'CANCELLED') return false;
  if (fromColumn === toColumn) return false;

  const fromIdx = ORDER_BOARD_COLUMNS.indexOf(fromColumn);
  const toIdx = ORDER_BOARD_COLUMNS.indexOf(toColumn);
  if (fromIdx < 0 || toIdx < 0) return false;

  if (toColumn === 'WITH_COURIER' && card.type !== 'DELIVERY') return false;

  if (fromColumn === 'READY' && toColumn === 'HANDED_OFF' && card.type === 'PICKUP') {
    return true;
  }

  if (toIdx === fromIdx + 1) return true;

  if (toIdx === fromIdx - 1 && fromColumn === 'IN_WORK' && toColumn === 'NEW') {
    return card.status !== 'IN_PREPARATION';
  }

  return false;
}

export function calendarMoveLabel(
  fromColumn: OrderBoardColumn,
  toColumn: OrderBoardColumn,
  card: OrderBoardCardDto,
): string {
  if (fromColumn === 'NEW' && toColumn === 'IN_WORK') return 'Взять в работу';
  if (fromColumn === 'IN_WORK' && toColumn === 'NEW') return 'Вернуть в новые';
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
    await moveOrderToInWork(client, organizationId, storeId, orderId, card.status);
    return;
  }

  if (fromColumn === 'IN_WORK' && toColumn === 'NEW') {
    if (card.status === 'IN_PREPARATION') {
      throw new Error(
        'Нельзя вернуть в «Новые»: сборка уже начата. Завершите сборку или отмените заказ.',
      );
    }
    await client.releaseAssignment(organizationId, storeId, orderId, {
      reason: CALENDAR_RELEASE_REASON,
    });
    return;
  }

  if (fromColumn === 'IN_WORK' && toColumn === 'READY') {
    await ensureOrderInPreparation(client, organizationId, storeId, orderId, card.status);
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
      return permissions.canAssign || permissions.canPrepare;
    case 'READY':
      return permissions.canPrepare || permissions.canDelivery;
    case 'WITH_COURIER':
      return permissions.canDelivery;
    case 'CANCELLED':
      return false;
    default:
      return false;
  }
}
