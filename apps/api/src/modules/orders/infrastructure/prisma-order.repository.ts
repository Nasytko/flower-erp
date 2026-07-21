import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ActualComposition as PrismaActualComposition,
  ActualCompositionItem as PrismaActualItem,
  Customer as PrismaCustomer,
  Item as PrismaItem,
  Order as PrismaOrder,
  OrderAssignment as PrismaAssignment,
  OrderComment as PrismaComment,
  OrderComposition as PrismaComposition,
  OrderCompositionItem as PrismaCompositionItem,
  OrderCompositionReplacement as PrismaReplacement,
  OrderTimelineEvent as PrismaTimeline,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type { OrderOccasion, OrderStatus, OrderType } from '../domain/order-rules';
import {
  AssignmentConflictError,
  CustomerPhoneConflictError,
  type ActualCompositionItemInput,
  type ActualCompositionItemView,
  type ActualCompositionView,
  type AssignmentView,
  type CommentView,
  type CompositionItemView,
  type CompositionReplacementReason,
  type CompositionReplacementView,
  type CompositionView,
  type CustomerView,
  type ItemBriefView,
  type OrderRepository,
  type OrderView,
  type PlannedCompositionItemInput,
  type TimelineEventView,
} from '../application/ports/order.repository';

type ItemRow = PrismaItem;

type CompositionItemRow = PrismaCompositionItem & { item: ItemRow };
type CompositionRow = PrismaComposition & { items: CompositionItemRow[] };

type ActualItemRow = PrismaActualItem & { item: ItemRow };
type ActualRow = PrismaActualComposition & { items: ActualItemRow[] };

type OrderFull = PrismaOrder & {
  composition: CompositionRow | null;
  actualComposition: ActualRow | null;
  assignments: PrismaAssignment[];
  timeline: PrismaTimeline[];
  comments: PrismaComment[];
};

const orderInclude = {
  composition: { include: { items: { include: { item: true }, orderBy: { sortOrder: 'asc' as const } } } },
  actualComposition: {
    include: { items: { include: { item: true }, orderBy: { sortOrder: 'asc' as const } } },
  },
  assignments: { where: { releasedAt: null }, take: 1 },
  timeline: { orderBy: { occurredAt: 'asc' as const } },
  comments: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

function mapItemBrief(item: ItemRow): ItemBriefView {
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    status: item.status,
    unitId: item.unitId,
    inventoryPolicyId: item.inventoryPolicyId,
    itemType: item.itemType,
  };
}

function mapCustomer(row: PrismaCustomer): CustomerView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    preferredLanguage: row.preferredLanguage,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCompositionItem(row: CompositionItemRow): CompositionItemView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    compositionId: row.compositionId,
    itemId: row.itemId,
    plannedQuantity: row.plannedQuantity.toString(),
    comment: row.comment,
    sortOrder: row.sortOrder,
    item: mapItemBrief(row.item),
  };
}

function mapComposition(row: CompositionRow): CompositionView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    orderId: row.orderId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map(mapCompositionItem),
  };
}

function mapActualItem(row: ActualItemRow): ActualCompositionItemView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    compositionId: row.compositionId,
    itemId: row.itemId,
    actualQuantity: row.actualQuantity.toString(),
    batchId: row.batchId,
    comment: row.comment,
    sortOrder: row.sortOrder,
    item: mapItemBrief(row.item),
  };
}

function mapActual(row: ActualRow): ActualCompositionView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    orderId: row.orderId,
    frozenAt: row.frozenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map(mapActualItem),
  };
}

function mapAssignment(row: PrismaAssignment): AssignmentView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    orderId: row.orderId,
    membershipId: row.membershipId,
    assignedAt: row.assignedAt,
    releasedAt: row.releasedAt,
    createdAt: row.createdAt,
  };
}

function mapTimeline(row: PrismaTimeline): TimelineEventView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    orderId: row.orderId,
    type: row.type,
    message: row.message,
    actorMembershipId: row.actorMembershipId,
    payload: row.payload,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

function mapComment(row: PrismaComment): CommentView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    orderId: row.orderId,
    authorMembershipId: row.authorMembershipId,
    message: row.message,
    createdAt: row.createdAt,
  };
}

function mapReplacement(row: PrismaReplacement): CompositionReplacementView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    orderId: row.orderId,
    fromItemId: row.fromItemId,
    toItemId: row.toItemId,
    quantity: row.quantity.toString(),
    reason: row.reason,
    comment: row.comment,
    actorMembershipId: row.actorMembershipId,
    createdAt: row.createdAt,
  };
}

function mapOrder(row: OrderFull): OrderView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    warehouseId: row.warehouseId,
    customerId: row.customerId,
    number: row.number,
    status: row.status,
    type: row.type,
    occasion: row.occasion,
    orderDate: row.orderDate,
    readyAt: row.readyAt,
    customerNameSnapshot: row.customerNameSnapshot,
    customerPhoneSnapshot: row.customerPhoneSnapshot,
    recipientName: row.recipientName,
    recipientPhone: row.recipientPhone,
    comment: row.comment,
    referenceUrl: row.referenceUrl,
    referenceComment: row.referenceComment,
    plannedPrice: row.plannedPrice?.toString() ?? null,
    assignedFloristId: row.assignedFloristId,
    createdByMembershipId: row.createdByMembershipId,
    confirmedAt: row.confirmedAt,
    reservedAt: row.reservedAt,
    preparationStartedAt: row.preparationStartedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
    composition: row.composition ? mapComposition(row.composition) : null,
    actualComposition: row.actualComposition ? mapActual(row.actualComposition) : null,
    activeAssignment: row.assignments[0] ? mapAssignment(row.assignments[0]) : null,
    timeline: row.timeline.map(mapTimeline),
    comments: row.comments.map(mapComment),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async listCustomers(
    organizationId: string,
    filter?: { status?: string; search?: string },
  ): Promise<CustomerView[]> {
    const rows = await this.client().customer.findMany({
      where: {
        organizationId,
        ...(filter?.status ? { status: filter.status as 'ACTIVE' | 'ARCHIVED' } : {}),
        ...(filter?.search
          ? {
              OR: [
                { name: { contains: filter.search, mode: 'insensitive' } },
                { phone: { contains: filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }],
    });
    return rows.map(mapCustomer);
  }

  async getCustomer(organizationId: string, customerId: string): Promise<CustomerView | null> {
    const row = await this.client().customer.findFirst({
      where: { id: customerId, organizationId },
    });
    return row ? mapCustomer(row) : null;
  }

  async createCustomer(input: {
    id: string;
    organizationId: string;
    name: string;
    phone: string;
    email: string | null;
    notes: string | null;
    preferredLanguage: string | null;
  }): Promise<CustomerView> {
    try {
      const row = await this.client().customer.create({
        data: {
          id: input.id,
          organizationId: input.organizationId,
          name: input.name,
          phone: input.phone,
          email: input.email,
          notes: input.notes,
          preferredLanguage: input.preferredLanguage,
        },
      });
      return mapCustomer(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CustomerPhoneConflictError();
      }
      throw error;
    }
  }

  async updateCustomer(
    organizationId: string,
    customerId: string,
    data: {
      name?: string;
      phone?: string;
      email?: string | null;
      notes?: string | null;
      preferredLanguage?: string | null;
    },
  ): Promise<CustomerView> {
    try {
      await this.client().customer.updateMany({
        where: { id: customerId, organizationId },
        data,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CustomerPhoneConflictError();
      }
      throw error;
    }
    const row = await this.getCustomer(organizationId, customerId);
    if (!row) throw new Error('Customer not found after update');
    return row;
  }

  async archiveCustomer(organizationId: string, customerId: string): Promise<CustomerView> {
    await this.client().customer.updateMany({
      where: { id: customerId, organizationId },
      data: { status: 'ARCHIVED' },
    });
    const row = await this.getCustomer(organizationId, customerId);
    if (!row) throw new Error('Customer not found after archive');
    return row;
  }

  async uniqueNumber(prefix: string, organizationId: string): Promise<string> {
    for (let i = 0; i < 8; i += 1) {
      const number = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const exists = await this.client().order.findFirst({ where: { organizationId, number } });
      if (!exists) return number;
    }
    throw new Error('Failed to allocate unique order number');
  }

  async createOrder(input: {
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
  }): Promise<OrderView> {
    const row = await this.client().order.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        storeId: input.storeId,
        warehouseId: input.warehouseId,
        customerId: input.customerId,
        number: input.number,
        type: input.type,
        occasion: input.occasion,
        orderDate: input.orderDate,
        readyAt: input.readyAt,
        customerNameSnapshot: input.customerNameSnapshot,
        customerPhoneSnapshot: input.customerPhoneSnapshot,
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        comment: input.comment,
        referenceUrl: input.referenceUrl,
        referenceComment: input.referenceComment,
        plannedPrice: input.plannedPrice,
        createdByMembershipId: input.createdByMembershipId,
        composition: {
          create: {
            id: input.compositionId,
            organizationId: input.organizationId,
          },
        },
      },
      include: orderInclude,
    });
    return mapOrder(row as OrderFull);
  }

  async getOrder(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<OrderView | null> {
    const row = await this.client().order.findFirst({
      where: { id: orderId, organizationId, storeId },
      include: orderInclude,
    });
    return row ? mapOrder(row as OrderFull) : null;
  }

  async listOrders(
    organizationId: string,
    storeId: string,
    filter?: { status?: OrderStatus },
  ): Promise<OrderView[]> {
    const rows = await this.client().order.findMany({
      where: {
        organizationId,
        storeId,
        ...(filter?.status ? { status: filter.status } : {}),
      },
      include: orderInclude,
      orderBy: [{ readyAt: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => mapOrder(r as OrderFull));
  }

  async updateOrder(
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
  ): Promise<OrderView> {
    await this.client().order.updateMany({
      where: { id: orderId, organizationId, storeId },
      data: {
        ...data,
        plannedPrice:
          data.plannedPrice === undefined
            ? undefined
            : data.plannedPrice === null
              ? null
              : data.plannedPrice,
      },
    });
    const row = await this.getOrder(organizationId, storeId, orderId);
    if (!row) throw new Error('Order not found after update');
    return row;
  }

  async updateStatus(
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
  ): Promise<OrderView> {
    await this.client().order.updateMany({
      where: { id: orderId, organizationId, storeId },
      data: { status, ...timestamps },
    });
    const row = await this.getOrder(organizationId, storeId, orderId);
    if (!row) throw new Error('Order not found after status update');
    return row;
  }

  async listOpenForDashboard(organizationId: string, storeId: string): Promise<OrderView[]> {
    const rows = await this.client().order.findMany({
      where: {
        organizationId,
        storeId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      include: orderInclude,
      orderBy: [{ readyAt: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => mapOrder(r as OrderFull));
  }

  async getComposition(
    organizationId: string,
    orderId: string,
  ): Promise<CompositionView | null> {
    const row = await this.client().orderComposition.findFirst({
      where: { organizationId, orderId },
      include: { items: { include: { item: true }, orderBy: { sortOrder: 'asc' } } },
    });
    return row ? mapComposition(row as CompositionRow) : null;
  }

  async replaceCompositionItems(
    organizationId: string,
    orderId: string,
    compositionId: string,
    items: PlannedCompositionItemInput[],
  ): Promise<CompositionView> {
    const client = this.client();
    await client.orderCompositionItem.deleteMany({
      where: { organizationId, compositionId },
    });
    if (items.length > 0) {
      await client.orderCompositionItem.createMany({
        data: items.map((item) => ({
          id: item.id,
          organizationId,
          compositionId,
          itemId: item.itemId,
          plannedQuantity: item.plannedQuantity,
          comment: item.comment,
          sortOrder: item.sortOrder,
        })),
      });
    }
    const composition = await this.getComposition(organizationId, orderId);
    if (!composition) throw new Error('Composition not found after replace');
    return composition;
  }

  async getActualComposition(
    organizationId: string,
    orderId: string,
  ): Promise<ActualCompositionView | null> {
    const row = await this.client().actualComposition.findFirst({
      where: { organizationId, orderId },
      include: { items: { include: { item: true }, orderBy: { sortOrder: 'asc' } } },
    });
    return row ? mapActual(row as ActualRow) : null;
  }

  async seedActualFromPlanned(input: {
    id: string;
    organizationId: string;
    orderId: string;
    items: ActualCompositionItemInput[];
  }): Promise<ActualCompositionView> {
    const client = this.client();
    const existing = await client.actualComposition.findFirst({
      where: { organizationId: input.organizationId, orderId: input.orderId },
    });
    if (existing) {
      await client.actualCompositionItem.deleteMany({
        where: { organizationId: input.organizationId, compositionId: existing.id },
      });
      if (input.items.length > 0) {
        await client.actualCompositionItem.createMany({
          data: input.items.map((item) => ({
            id: item.id,
            organizationId: input.organizationId,
            compositionId: existing.id,
            itemId: item.itemId,
            actualQuantity: item.actualQuantity,
            batchId: item.batchId,
            comment: item.comment,
            sortOrder: item.sortOrder,
          })),
        });
      }
      const row = await this.getActualComposition(input.organizationId, input.orderId);
      if (!row) throw new Error('Actual composition not found after seed');
      return row;
    }

    await client.actualComposition.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        orderId: input.orderId,
        items: {
          create: input.items.map((item) => ({
            id: item.id,
            organizationId: input.organizationId,
            itemId: item.itemId,
            actualQuantity: item.actualQuantity,
            batchId: item.batchId,
            comment: item.comment,
            sortOrder: item.sortOrder,
          })),
        },
      },
    });
    const row = await this.getActualComposition(input.organizationId, input.orderId);
    if (!row) throw new Error('Actual composition not found after seed');
    return row;
  }

  async replaceActualItems(
    organizationId: string,
    orderId: string,
    compositionId: string,
    items: ActualCompositionItemInput[],
  ): Promise<ActualCompositionView> {
    const client = this.client();
    await client.actualCompositionItem.deleteMany({
      where: { organizationId, compositionId },
    });
    if (items.length > 0) {
      await client.actualCompositionItem.createMany({
        data: items.map((item) => ({
          id: item.id,
          organizationId,
          compositionId,
          itemId: item.itemId,
          actualQuantity: item.actualQuantity,
          batchId: item.batchId,
          comment: item.comment,
          sortOrder: item.sortOrder,
        })),
      });
    }
    const row = await this.getActualComposition(organizationId, orderId);
    if (!row) throw new Error('Actual composition not found after replace');
    return row;
  }

  async freezeActual(
    organizationId: string,
    orderId: string,
    frozenAt: Date,
  ): Promise<ActualCompositionView> {
    await this.client().actualComposition.updateMany({
      where: { organizationId, orderId },
      data: { frozenAt },
    });
    const row = await this.getActualComposition(organizationId, orderId);
    if (!row) throw new Error('Actual composition not found after freeze');
    return row;
  }

  async createCompositionReplacement(input: {
    id: string;
    organizationId: string;
    orderId: string;
    fromItemId: string;
    toItemId: string;
    quantity: string;
    reason: CompositionReplacementReason;
    comment: string | null;
    actorMembershipId: string | null;
  }): Promise<CompositionReplacementView> {
    const row = await this.client().orderCompositionReplacement.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        orderId: input.orderId,
        fromItemId: input.fromItemId,
        toItemId: input.toItemId,
        quantity: input.quantity,
        reason: input.reason,
        comment: input.comment,
        actorMembershipId: input.actorMembershipId,
      },
    });
    return mapReplacement(row);
  }

  async lockNextClaimableOrderId(input: {
    organizationId: string;
    storeId: string;
    now: Date;
    soonMinutes: number;
  }): Promise<string | null> {
    const soonAt = new Date(input.now.getTime() + input.soonMinutes * 60_000);
    const rows = await this.client().$queryRaw<Array<{ id: string }>>`
      SELECT o.id
      FROM orders o
      WHERE o.organization_id = ${input.organizationId}::uuid
        AND o.store_id = ${input.storeId}::uuid
        AND o.status IN ('CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED', 'IN_PREPARATION')
        AND NOT EXISTS (
          SELECT 1
          FROM order_assignments a
          WHERE a.order_id = o.id
            AND a.released_at IS NULL
        )
      ORDER BY
        CASE
          WHEN o.ready_at IS NOT NULL AND o.ready_at < ${input.now} THEN 0
          WHEN o.ready_at IS NOT NULL AND o.ready_at <= ${soonAt} THEN 1
          WHEN o.status = 'IN_PREPARATION' THEN 2
          WHEN o.ready_at IS NOT NULL
            AND o.ready_at::date = (${input.now})::date THEN 3
          ELSE 4
        END ASC,
        o.ready_at ASC NULLS LAST,
        o.created_at ASC
      FOR UPDATE OF o SKIP LOCKED
      LIMIT 1
    `;
    return rows[0]?.id ?? null;
  }

  async incrementVersion(
    organizationId: string,
    storeId: string,
    orderId: string,
    expectedVersion: number,
  ): Promise<number | null> {
    const result = await this.client().order.updateMany({
      where: { id: orderId, organizationId, storeId, version: expectedVersion },
      data: { version: { increment: 1 } },
    });
    if (result.count === 0) return null;
    return expectedVersion + 1;
  }

  async createActiveAssignment(input: {
    id: string;
    organizationId: string;
    orderId: string;
    membershipId: string;
    assignedAt: Date;
  }): Promise<AssignmentView> {
    try {
      const row = await this.client().orderAssignment.create({
        data: {
          id: input.id,
          organizationId: input.organizationId,
          orderId: input.orderId,
          membershipId: input.membershipId,
          assignedAt: input.assignedAt,
        },
      });
      return mapAssignment(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AssignmentConflictError();
      }
      throw error;
    }
  }

  async releaseActiveAssignment(
    organizationId: string,
    orderId: string,
    releasedAt: Date,
  ): Promise<AssignmentView | null> {
    const active = await this.getActiveAssignment(organizationId, orderId);
    if (!active) return null;
    await this.client().orderAssignment.updateMany({
      where: { id: active.id, organizationId, releasedAt: null },
      data: { releasedAt },
    });
    return { ...active, releasedAt };
  }

  async getActiveAssignment(
    organizationId: string,
    orderId: string,
  ): Promise<AssignmentView | null> {
    const row = await this.client().orderAssignment.findFirst({
      where: { organizationId, orderId, releasedAt: null },
    });
    return row ? mapAssignment(row) : null;
  }

  async appendTimeline(input: {
    id: string;
    organizationId: string;
    orderId: string;
    type: string;
    message: string | null;
    actorMembershipId: string | null;
    payload: unknown;
    occurredAt: Date;
  }): Promise<TimelineEventView> {
    const row = await this.client().orderTimelineEvent.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        orderId: input.orderId,
        type: input.type as PrismaTimeline['type'],
        message: input.message,
        actorMembershipId: input.actorMembershipId,
        payload: input.payload === undefined ? undefined : (input.payload as Prisma.InputJsonValue),
        occurredAt: input.occurredAt,
      },
    });
    return mapTimeline(row);
  }

  async listTimeline(organizationId: string, orderId: string): Promise<TimelineEventView[]> {
    const rows = await this.client().orderTimelineEvent.findMany({
      where: { organizationId, orderId },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map(mapTimeline);
  }

  async addComment(input: {
    id: string;
    organizationId: string;
    orderId: string;
    authorMembershipId: string;
    message: string;
  }): Promise<CommentView> {
    const row = await this.client().orderComment.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        orderId: input.orderId,
        authorMembershipId: input.authorMembershipId,
        message: input.message,
      },
    });
    return mapComment(row);
  }

  async listComments(organizationId: string, orderId: string): Promise<CommentView[]> {
    const rows = await this.client().orderComment.findMany({
      where: { organizationId, orderId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapComment);
  }
}
