import type { OrderOccasion, OrderStatus, OrderType } from '../../domain/order-rules';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export class AssignmentConflictError extends Error {
  constructor(message = 'Order already has an active florist assignment') {
    super(message);
    this.name = 'AssignmentConflictError';
  }
}

export class CustomerPhoneConflictError extends Error {
  constructor(message = 'Customer phone already exists in this organization') {
    super(message);
    this.name = 'CustomerPhoneConflictError';
  }
}

export type ItemBriefView = {
  id: string;
  name: string;
  code: string;
  status: string;
  unitId: string;
  inventoryPolicyId: string;
  itemType: string;
};

export type CustomerView = {
  id: string;
  organizationId: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  preferredLanguage: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CompositionItemView = {
  id: string;
  organizationId: string;
  compositionId: string;
  itemId: string;
  plannedQuantity: string;
  comment: string | null;
  sortOrder: number;
  item: ItemBriefView;
  /** Populated by use-cases via InventoryReservationPort */
  reservedQuantity?: string;
  deficitQuantity?: string;
};

export type CompositionView = {
  id: string;
  organizationId: string;
  orderId: string;
  createdAt: Date;
  updatedAt: Date;
  items: CompositionItemView[];
};

export type ActualCompositionItemView = {
  id: string;
  organizationId: string;
  compositionId: string;
  itemId: string;
  actualQuantity: string;
  batchId: string | null;
  comment: string | null;
  sortOrder: number;
  item: ItemBriefView;
};

export type ActualCompositionView = {
  id: string;
  organizationId: string;
  orderId: string;
  frozenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: ActualCompositionItemView[];
};

export type AssignmentView = {
  id: string;
  organizationId: string;
  orderId: string;
  membershipId: string;
  assignedAt: Date;
  releasedAt: Date | null;
  createdAt: Date;
};

export type TimelineEventView = {
  id: string;
  organizationId: string;
  orderId: string;
  type: string;
  message: string | null;
  actorMembershipId: string | null;
  payload: unknown;
  occurredAt: Date;
  createdAt: Date;
};

export type CommentView = {
  id: string;
  organizationId: string;
  orderId: string;
  authorMembershipId: string;
  message: string;
  createdAt: Date;
};

export type OrderView = {
  id: string;
  organizationId: string;
  storeId: string;
  warehouseId: string;
  customerId: string | null;
  number: string;
  status: OrderStatus | string;
  type: OrderType | string;
  occasion: OrderOccasion | string;
  orderDate: Date;
  readyAt: Date | null;
  customerNameSnapshot: string | null;
  customerPhoneSnapshot: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  comment: string | null;
  referenceUrl: string | null;
  referenceComment: string | null;
  plannedPrice: string | null;
  assignedFloristId: string | null;
  createdByMembershipId: string | null;
  confirmedAt: Date | null;
  reservedAt: Date | null;
  preparationStartedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  composition: CompositionView | null;
  actualComposition: ActualCompositionView | null;
  activeAssignment: AssignmentView | null;
  timeline: TimelineEventView[];
  comments: CommentView[];
  /** Populated by use-cases enrichment */
  hasDeficit?: boolean;
};

export type OrderDashboardBuckets = {
  today: OrderView[];
  overdue: OrderView[];
  unassigned: OrderView[];
  partiallyReserved: OrderView[];
  ready: OrderView[];
  inProgress: OrderView[];
};

export type PlannedCompositionItemInput = {
  id: string;
  itemId: string;
  plannedQuantity: string;
  comment: string | null;
  sortOrder: number;
};

export type ActualCompositionItemInput = {
  id: string;
  itemId: string;
  actualQuantity: string;
  batchId: string | null;
  comment: string | null;
  sortOrder: number;
};

export type CompositionReplacementReason =
  | 'OUT_OF_STOCK'
  | 'QUALITY'
  | 'CUSTOMER_REQUEST'
  | 'FLORIST_DECISION'
  | 'OTHER';

export type CompositionReplacementView = {
  id: string;
  organizationId: string;
  orderId: string;
  fromItemId: string;
  toItemId: string;
  quantity: string;
  reason: CompositionReplacementReason;
  comment: string | null;
  actorMembershipId: string | null;
  createdAt: Date;
};

export interface OrderRepository {
  // ─── Customer (org-scoped) ─────────────────────────────────────────────────
  listCustomers(
    organizationId: string,
    filter?: { status?: string; search?: string },
  ): Promise<CustomerView[]>;
  getCustomer(organizationId: string, customerId: string): Promise<CustomerView | null>;
  createCustomer(input: {
    id: string;
    organizationId: string;
    name: string;
    phone: string;
    email: string | null;
    notes: string | null;
    preferredLanguage: string | null;
  }): Promise<CustomerView>;
  updateCustomer(
    organizationId: string,
    customerId: string,
    data: {
      name?: string;
      phone?: string;
      email?: string | null;
      notes?: string | null;
      preferredLanguage?: string | null;
    },
  ): Promise<CustomerView>;
  archiveCustomer(organizationId: string, customerId: string): Promise<CustomerView>;

  // ─── Order ─────────────────────────────────────────────────────────────────
  uniqueNumber(prefix: string, organizationId: string): Promise<string>;
  createOrder(input: {
    id: string;
    organizationId: string;
    storeId: string;
    warehouseId: string;
    customerId: string | null;
    number: string;
    type: OrderType;
    occasion: OrderOccasion;
    orderDate: Date;
    readyAt: Date | null;
    customerNameSnapshot: string | null;
    customerPhoneSnapshot: string | null;
    recipientName: string | null;
    recipientPhone: string | null;
    comment: string | null;
    referenceUrl: string | null;
    referenceComment: string | null;
    plannedPrice: string | null;
    createdByMembershipId: string | null;
    compositionId: string;
  }): Promise<OrderView>;
  getOrder(organizationId: string, storeId: string, orderId: string): Promise<OrderView | null>;
  listOrders(
    organizationId: string,
    storeId: string,
    filter?: { status?: OrderStatus },
  ): Promise<OrderView[]>;
  updateOrder(
    organizationId: string,
    storeId: string,
    orderId: string,
    data: {
      type?: OrderType;
      occasion?: OrderOccasion;
      readyAt?: Date | null;
      customerId?: string | null;
      customerNameSnapshot?: string | null;
      customerPhoneSnapshot?: string | null;
      recipientName?: string | null;
      recipientPhone?: string | null;
      comment?: string | null;
      referenceUrl?: string | null;
      referenceComment?: string | null;
      plannedPrice?: string | null;
      warehouseId?: string;
      assignedFloristId?: string | null;
    },
  ): Promise<OrderView>;
  updateStatus(
    organizationId: string,
    storeId: string,
    orderId: string,
    status: OrderStatus,
    timestamps?: Partial<{
      confirmedAt: Date | null;
      reservedAt: Date | null;
      preparationStartedAt: Date | null;
      completedAt: Date | null;
      cancelledAt: Date | null;
    }>,
  ): Promise<OrderView>;
  listOpenForDashboard(organizationId: string, storeId: string): Promise<OrderView[]>;
  /**
   * Atomically pick next claimable unassigned order (FOR UPDATE SKIP LOCKED).
   * Returns null when none available.
   */
  lockNextClaimableOrderId(input: {
    organizationId: string;
    storeId: string;
    now: Date;
    soonMinutes: number;
  }): Promise<string | null>;
  /** Bump Order.version; returns new version. */
  incrementVersion(
    organizationId: string,
    storeId: string,
    orderId: string,
    expectedVersion: number,
  ): Promise<number | null>;

  // ─── Planned composition ───────────────────────────────────────────────────
  getComposition(
    organizationId: string,
    orderId: string,
  ): Promise<CompositionView | null>;
  replaceCompositionItems(
    organizationId: string,
    orderId: string,
    compositionId: string,
    items: PlannedCompositionItemInput[],
  ): Promise<CompositionView>;

  // ─── Actual composition ────────────────────────────────────────────────────
  getActualComposition(
    organizationId: string,
    orderId: string,
  ): Promise<ActualCompositionView | null>;
  seedActualFromPlanned(input: {
    id: string;
    organizationId: string;
    orderId: string;
    items: ActualCompositionItemInput[];
  }): Promise<ActualCompositionView>;
  replaceActualItems(
    organizationId: string,
    orderId: string,
    compositionId: string,
    items: ActualCompositionItemInput[],
  ): Promise<ActualCompositionView>;
  freezeActual(
    organizationId: string,
    orderId: string,
    frozenAt: Date,
  ): Promise<ActualCompositionView>;
  createCompositionReplacement(input: {
    id: string;
    organizationId: string;
    orderId: string;
    fromItemId: string;
    toItemId: string;
    quantity: string;
    reason: CompositionReplacementReason;
    comment: string | null;
    actorMembershipId: string | null;
  }): Promise<CompositionReplacementView>;

  // ─── Assignment (one active via partial unique index) ──────────────────────
  createActiveAssignment(input: {
    id: string;
    organizationId: string;
    orderId: string;
    membershipId: string;
    assignedAt: Date;
  }): Promise<AssignmentView>;
  releaseActiveAssignment(
    organizationId: string,
    orderId: string,
    releasedAt: Date,
  ): Promise<AssignmentView | null>;
  getActiveAssignment(
    organizationId: string,
    orderId: string,
  ): Promise<AssignmentView | null>;

  // ─── Timeline ──────────────────────────────────────────────────────────────
  appendTimeline(input: {
    id: string;
    organizationId: string;
    orderId: string;
    type: string;
    message: string | null;
    actorMembershipId: string | null;
    payload: unknown;
    occurredAt: Date;
  }): Promise<TimelineEventView>;
  listTimeline(organizationId: string, orderId: string): Promise<TimelineEventView[]>;

  // ─── Comments ──────────────────────────────────────────────────────────────
  addComment(input: {
    id: string;
    organizationId: string;
    orderId: string;
    authorMembershipId: string;
    message: string;
  }): Promise<CommentView>;
  listComments(organizationId: string, orderId: string): Promise<CommentView[]>;
}
