import { deliveryStatusLabel } from '@/lib/delivery-labels';
import {
  orderLifecycleSteps,
  orderPhaseLabel,
  resolveOrderPhase,
  type OrderPhase,
} from '@/lib/order-ui';
import { statusLabelRu } from '@/lib/status-labels-ru';

export type JourneyStepState = 'pending' | 'active' | 'done' | 'skipped' | 'cancelled';

export type JourneyMiniStep = {
  id: string;
  label: string;
  state: JourneyStepState;
};

export type JourneyBranchId = 'order' | 'delivery' | 'sale';

export type JourneyBranch = {
  id: JourneyBranchId;
  title: string;
  docNumber?: string;
  statusText: string;
  href?: string;
  actionHref?: string;
  actionLabel?: string;
  steps: JourneyMiniStep[];
  branchState: JourneyStepState;
  visible: boolean;
  isCurrent: boolean;
};

export type JourneyStripNode = {
  id: JourneyBranchId;
  label: string;
  shortLabel: string;
  state: JourneyStepState;
  isCurrent: boolean;
};

export type JourneyNextAction = {
  branchId: JourneyBranchId;
  title: string;
  description?: string;
  href: string;
  actionLabel: string;
};

export type OrderJourneyOrder = {
  id: string;
  number: string;
  type: string;
  status: string;
  displayPhase?: string;
  displayPhaseLabel?: string;
  hasActiveAssignment?: boolean;
  completedAt?: string | null;
  /** Workspace hint: CREATE_SALE, MARK_READY, CLAIM, … */
  primaryAction?: string;
};

export type OrderJourneyDelivery = {
  id: string;
  number: string;
  status: string;
  handedOverAt?: string | null;
};

export type OrderJourneySale = {
  id: string;
  number: string;
  status: string;
};

export type OrderJourneyInput = {
  basePath: string;
  order: OrderJourneyOrder;
  delivery?: OrderJourneyDelivery | null;
  sale?: OrderJourneySale | null;
  links?: {
    order?: boolean;
    delivery?: boolean;
    sale?: boolean;
  };
  permissions?: {
    createSale?: boolean;
  };
};

const DELIVERY_STEPS = [
  { id: 'wait', label: 'Ожидает' },
  { id: 'dispatch', label: 'К передаче' },
  { id: 'transit', label: 'В пути' },
  { id: 'delivered', label: 'Доставлен' },
] as const;

const SALE_STEPS = [
  { id: 'create', label: 'Создание' },
  { id: 'draft', label: 'Черновик' },
  { id: 'complete', label: 'Завершена' },
] as const;

const STRIP_SHORT: Record<JourneyBranchId, string> = {
  order: 'Заказ',
  delivery: 'Доставка',
  sale: 'Продажа',
};

function miniStepState(index: number, currentIndex: number, cancelled: boolean): JourneyStepState {
  if (cancelled) return 'cancelled';
  if (currentIndex < 0) return 'pending';
  if (index < currentIndex) return 'done';
  if (index === currentIndex) return 'active';
  return 'pending';
}

function orderPhaseIndex(phase: OrderPhase, cancelled: boolean): number {
  if (cancelled) return -1;
  return orderLifecycleSteps().indexOf(phase);
}

function deliveryPhaseIndex(status: string): number {
  if (status === 'CANCELLED') return -1;
  if (status === 'DELIVERED') return 3;
  if (status === 'IN_TRANSIT') return 2;
  if (status === 'READY_FOR_DISPATCH' || status === 'ASSIGNED') return 1;
  if (status === 'PROBLEM') return 2;
  return 0;
}

function salePhaseIndex(
  sale: OrderJourneySale | null | undefined,
  orderPhase: OrderPhase,
  orderStatus: string,
): number {
  if (sale?.status === 'ANNULLED') return -1;
  if (sale?.status === 'COMPLETED') return 2;
  if (sale?.status === 'DRAFT') return 1;
  if (orderStatus === 'COMPLETED' && !sale) return -2;
  if (orderPhase === 'READY' || orderPhase === 'HANDED_OFF') return 0;
  return -1;
}

function branchStateFromSteps(steps: JourneyMiniStep[], cancelled: boolean): JourneyStepState {
  if (cancelled) return 'cancelled';
  if (steps.every((s) => s.state === 'done')) return 'done';
  if (steps.some((s) => s.state === 'active')) return 'active';
  if (steps.every((s) => s.state === 'pending')) return 'pending';
  return 'active';
}

function deliveryBranchDone(status: string | undefined): boolean {
  return status === 'DELIVERED' || status === 'CANCELLED';
}

function assignCurrentBranch(
  branches: JourneyBranch[],
  input: {
    orderPhase: OrderPhase;
    orderStatus: string;
    orderType: string;
    delivery?: OrderJourneyDelivery | null;
    sale?: OrderJourneySale | null;
    saleSkippedWithoutDoc: boolean;
  },
): void {
  for (const branch of branches) {
    branch.isCurrent = false;
  }
  if (input.orderStatus === 'CANCELLED') return;

  const orderBranch = branches.find((b) => b.id === 'order');
  const deliveryBranch = branches.find((b) => b.id === 'delivery');
  const saleBranch = branches.find((b) => b.id === 'sale');

  const orderInProgress =
    input.orderPhase === 'NEW' || input.orderPhase === 'IN_WORK';
  const orderReady = input.orderPhase === 'READY';
  const orderDone = input.orderPhase === 'HANDED_OFF' || input.orderStatus === 'COMPLETED';

  if (orderInProgress && orderBranch) {
    orderBranch.isCurrent = true;
    return;
  }

  if (orderReady) {
    if (
      input.orderType === 'DELIVERY' &&
      deliveryBranch?.visible &&
      input.delivery &&
      !deliveryBranchDone(input.delivery.status)
    ) {
      deliveryBranch.isCurrent = true;
      return;
    }
    if (
      saleBranch &&
      !input.saleSkippedWithoutDoc &&
      (!input.sale || input.sale.status === 'DRAFT')
    ) {
      saleBranch.isCurrent = true;
      return;
    }
    if (orderBranch) {
      orderBranch.isCurrent = true;
      return;
    }
  }

  if (
    orderDone &&
    input.orderType === 'DELIVERY' &&
    deliveryBranch?.visible &&
    input.delivery &&
    !deliveryBranchDone(input.delivery.status)
  ) {
    deliveryBranch.isCurrent = true;
    return;
  }

  if (
    saleBranch &&
    !input.saleSkippedWithoutDoc &&
    input.sale?.status === 'DRAFT'
  ) {
    saleBranch.isCurrent = true;
  }
}

export function pickLinkedSale<
  T extends { id: string; status: string; number: string },
>(sales: T[]): T | null {
  const active = sales.filter((s) => s.status !== 'ANNULLED');
  if (!active.length) return null;
  return active.find((s) => s.status === 'COMPLETED') ?? active[0] ?? null;
}

export function buildOrderJourney(input: OrderJourneyInput): JourneyBranch[] {
  const { order, delivery, sale, basePath } = input;
  const links = {
    order: input.links?.order !== false,
    delivery: input.links?.delivery !== false,
    sale: input.links?.sale !== false,
  };

  const orderCancelled = order.status === 'CANCELLED';
  const orderPhase = resolveOrderPhase(
    {
      status: order.status,
      type: order.type,
      displayPhase: order.displayPhase,
      hasActiveAssignment: order.hasActiveAssignment,
      completedAt: order.completedAt,
    },
    delivery ? { status: delivery.status, handedOverAt: delivery.handedOverAt } : null,
  );
  const orderIdx = orderPhaseIndex(orderPhase, orderCancelled);
  const lifecycle = orderLifecycleSteps();
  const orderSteps: JourneyMiniStep[] = lifecycle.map((phase, idx) => ({
    id: phase,
    label: orderPhaseLabel(phase, order),
    state: miniStepState(idx, orderIdx, orderCancelled),
  }));

  const orderBranch: JourneyBranch = {
    id: 'order',
    title: 'Заказ',
    docNumber: order.number,
    statusText: orderCancelled
      ? statusLabelRu('CANCELLED')
      : order.displayPhaseLabel ?? orderPhaseLabel(orderPhase, order),
    href: links.order ? `${basePath}/orders/${order.id}` : undefined,
    actionHref: links.order ? `${basePath}/orders/${order.id}` : undefined,
    actionLabel: 'Карточка',
    steps: orderSteps,
    branchState: branchStateFromSteps(orderSteps, orderCancelled),
    visible: true,
    isCurrent: false,
  };

  const isDeliveryOrder = order.type === 'DELIVERY';
  const deliveryCancelled = delivery?.status === 'CANCELLED';
  const deliveryIdx = delivery ? deliveryPhaseIndex(delivery.status) : -1;
  const deliverySteps: JourneyMiniStep[] = DELIVERY_STEPS.map((step, idx) => ({
    id: step.id,
    label: step.label,
    state: delivery
      ? miniStepState(idx, deliveryIdx, Boolean(deliveryCancelled))
      : 'pending',
  }));

  const deliveryBranch: JourneyBranch = {
    id: 'delivery',
    title: 'Доставка',
    docNumber: delivery?.number,
    statusText: delivery
      ? deliveryStatusLabel(delivery.status)
      : isDeliveryOrder
        ? 'После подтверждения заказа'
        : 'Не требуется',
    href:
      delivery && links.delivery ? `${basePath}/deliveries/${delivery.id}` : undefined,
    actionHref:
      delivery && links.delivery ? `${basePath}/deliveries/${delivery.id}` : undefined,
    actionLabel: 'К доставке',
    steps: deliverySteps,
    branchState: !isDeliveryOrder
      ? 'skipped'
      : delivery
        ? branchStateFromSteps(deliverySteps, Boolean(deliveryCancelled))
        : 'pending',
    visible: isDeliveryOrder,
    isCurrent: false,
  };

  const saleIdx = salePhaseIndex(sale, orderPhase, order.status);
  const saleSkippedWithoutDoc =
    saleIdx === -2 && order.status === 'COMPLETED' && !sale;
  const saleCancelled = sale?.status === 'ANNULLED';
  const saleSteps: JourneyMiniStep[] = SALE_STEPS.map((step, idx) => ({
    id: step.id,
    label: step.label,
    state: saleSkippedWithoutDoc
      ? 'skipped'
      : miniStepState(idx, saleIdx, Boolean(saleCancelled)),
  }));

  const saleBranch: JourneyBranch = {
    id: 'sale',
    title: 'Продажа',
    docNumber: sale?.number,
    statusText: sale
      ? statusLabelRu(sale.status)
      : saleSkippedWithoutDoc
        ? 'Не оформлялась'
        : orderPhase === 'READY' || orderPhase === 'HANDED_OFF'
          ? 'Ещё не оформлена'
          : 'После готовности',
    href: sale && links.sale ? `${basePath}/sales/${sale.id}` : undefined,
    actionHref:
      !sale &&
      input.permissions?.createSale !== false &&
      links.sale &&
      (orderPhase === 'READY' || orderPhase === 'HANDED_OFF')
        ? `${basePath}/sales/new?fromOrder=${order.id}`
        : undefined,
    actionLabel: 'Оформить',
    steps: saleSteps,
    branchState: saleSkippedWithoutDoc
      ? 'skipped'
      : sale
        ? branchStateFromSteps(saleSteps, Boolean(saleCancelled))
        : 'pending',
    visible: true,
    isCurrent: false,
  };

  const branches = [orderBranch, deliveryBranch, saleBranch].filter((b) => b.visible);
  assignCurrentBranch(branches, {
    orderPhase,
    orderStatus: order.status,
    orderType: order.type,
    delivery,
    sale,
    saleSkippedWithoutDoc,
  });
  return branches;
}

export function buildJourneyStrip(input: OrderJourneyInput): JourneyStripNode[] {
  return buildOrderJourney(input).map((branch) => ({
    id: branch.id,
    label: branch.title,
    shortLabel: STRIP_SHORT[branch.id],
    state: branch.branchState,
    isCurrent: branch.isCurrent,
  }));
}

export function journeyCurrentBranch(branches: JourneyBranch[]): JourneyBranch | null {
  return branches.find((b) => b.isCurrent) ?? null;
}

export function journeyNextAction(input: OrderJourneyInput): JourneyNextAction | null {
  const branches = buildOrderJourney(input);
  const current = journeyCurrentBranch(branches);
  if (!current || input.order.status === 'CANCELLED') return null;

  const { order, basePath } = input;
  const orderPhase = resolveOrderPhase(
    {
      status: order.status,
      type: order.type,
      displayPhase: order.displayPhase,
      hasActiveAssignment: order.hasActiveAssignment,
      completedAt: order.completedAt,
    },
    input.delivery
      ? { status: input.delivery.status, handedOverAt: input.delivery.handedOverAt }
      : null,
  );

  if (current.id === 'order') {
    if (orderPhase === 'NEW' || orderPhase === 'IN_WORK') {
      const href = `${basePath}/orders/calendar`;
      return {
        branchId: 'order',
        title: orderPhase === 'NEW' ? 'Взять заказ в работу' : 'Завершите сборку',
        description: 'Перетащите карточку на календаре или откройте карточку заказа.',
        href,
        actionLabel: orderPhase === 'NEW' ? 'К календарю' : 'К календарю',
      };
    }
    if (orderPhase === 'READY' && order.type === 'PICKUP') {
      if (order.primaryAction === 'CREATE_SALE') {
        return {
          branchId: 'sale',
          title: 'Оформите продажу',
          description: 'Заказ готов — можно провести оплату и закрыть продажу.',
          href: `${basePath}/sales/new?fromOrder=${order.id}`,
          actionLabel: 'Оформить продажу',
        };
      }
      return {
        branchId: 'order',
        title: 'Передайте заказ клиенту',
        description: 'Самовывоз: отметьте передачу на карточке заказа.',
        href: `${basePath}/orders/${order.id}`,
        actionLabel: 'К карточке заказа',
      };
    }
  }

  if (current.id === 'delivery') {
    return {
      branchId: 'delivery',
      title: 'Передайте букет в доставку',
      description: 'Проверьте адрес и статус курьера.',
      href: current.href ?? `${basePath}/deliveries/${input.delivery!.id}`,
      actionLabel: 'Открыть доставку',
    };
  }

  if (current.id === 'sale') {
    if (current.actionHref) {
      return {
        branchId: 'sale',
        title: 'Оформите продажу',
        description: 'Заказ готов — проведите оплату и завершите продажу.',
        href: current.actionHref,
        actionLabel: 'Оформить продажу',
      };
    }
    if (input.sale?.status === 'DRAFT' && current.href) {
      return {
        branchId: 'sale',
        title: 'Завершите продажу',
        description: 'Черновик продажи — проверьте оплату и проведите документ.',
        href: current.href,
        actionLabel: 'Открыть продажу',
      };
    }
  }

  if (current.actionHref && current.actionLabel) {
    return {
      branchId: current.id,
      title: current.statusText,
      href: current.actionHref,
      actionLabel: current.actionLabel,
    };
  }

  if (current.href) {
    return {
      branchId: current.id,
      title: current.statusText,
      href: current.href,
      actionLabel: 'Открыть',
    };
  }

  return null;
}

/** Build journey input from workspace queue card + optional linked delivery. */
export function journeyInputFromWorkspaceCard(
  basePath: string,
  card: {
    id: string;
    number: string;
    type: string;
    status: string;
    displayPhase?: string;
    displayPhaseLabel?: string;
    hasActiveAssignment?: boolean;
    primaryAction?: string;
  },
  delivery?: OrderJourneyDelivery | null,
  sale?: OrderJourneySale | null,
): OrderJourneyInput {
  return {
    basePath,
    order: {
      id: card.id,
      number: card.number,
      type: card.type,
      status: card.status,
      displayPhase: card.displayPhase,
      displayPhaseLabel: card.displayPhaseLabel,
      hasActiveAssignment: card.hasActiveAssignment,
      primaryAction: card.primaryAction,
    },
    delivery,
    sale,
  };
}
