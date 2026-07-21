import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CashAccount as PrismaCashAccount,
  CashOperation as PrismaCashOperation,
  Payment as PrismaPayment,
  PaymentAllocation as PrismaAllocation,
  PaymentAllocationTransfer as PrismaTransfer,
  PaymentMethod as PrismaMethod,
  PaymentRefund as PrismaRefund,
  PaymentTimelineEvent as PrismaTimeline,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  CashAccountStatus,
  CashAccountType,
  CashOperationDirection,
  CashOperationType,
  PaymentAllocationTargetType,
  PaymentDirection,
  PaymentMethodType,
  PaymentRefundStatus,
  PaymentStatus,
  PaymentType,
} from '../domain/payment-rules';
import type {
  AllocationTransferView,
  CashAccountView,
  CashOperationView,
  CreateCashOperationInput,
  CreatePaymentInput,
  CreateRefundInput,
  IdempotencyRecord,
  PaymentAllocationView,
  PaymentMethodView,
  PaymentRefundView,
  PaymentRepository,
  PaymentTimelineEventView,
  PaymentView,
} from '../application/ports/payment.repository';

type PaymentFull = PrismaPayment & { allocations: PrismaAllocation[] };

const money = (value: Prisma.Decimal | string | number) =>
  new Prisma.Decimal(value).toFixed(2);

function mapMethod(row: PrismaMethod): PaymentMethodView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    type: row.type as PaymentMethodType,
    isActive: row.isActive,
    requiresExternalConfirmation: row.requiresExternalConfirmation,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAllocation(row: PrismaAllocation): PaymentAllocationView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    paymentId: row.paymentId,
    targetType: row.targetType as PaymentAllocationTargetType,
    targetId: row.targetId,
    amount: money(row.amount),
    isActive: row.isActive,
    supersededAt: row.supersededAt,
    createdAt: row.createdAt,
  };
}

function mapPayment(row: PaymentFull): PaymentView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    number: row.number,
    type: row.type as PaymentType,
    status: row.status as PaymentStatus,
    direction: row.direction as PaymentDirection,
    methodId: row.methodId,
    amount: money(row.amount),
    currencyCode: row.currencyCode,
    receivedAt: row.receivedAt,
    comment: row.comment,
    externalReference: row.externalReference,
    createdByMembershipId: row.createdByMembershipId,
    completedAt: row.completedAt,
    annulledAt: row.annulledAt,
    annulReason: row.annulReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    allocations: row.allocations.map(mapAllocation),
  };
}

function mapRefund(row: PrismaRefund): PaymentRefundView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    originalPaymentId: row.originalPaymentId,
    amount: money(row.amount),
    reason: row.reason,
    status: row.status as PaymentRefundStatus,
    methodId: row.methodId,
    externalReference: row.externalReference,
    createdByMembershipId: row.createdByMembershipId,
    completedAt: row.completedAt,
    annulledAt: row.annulledAt,
    annulReason: row.annulReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTimeline(row: PrismaTimeline): PaymentTimelineEventView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    paymentId: row.paymentId,
    type: row.type,
    message: row.message,
    actorMembershipId: row.actorMembershipId,
    payload: row.payload,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

function mapCashAccount(row: PrismaCashAccount): CashAccountView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    name: row.name,
    type: row.type as CashAccountType,
    status: row.status as CashAccountStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCashOperation(row: PrismaCashOperation): CashOperationView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    cashAccountId: row.cashAccountId,
    paymentId: row.paymentId,
    refundId: row.refundId,
    type: row.type as CashOperationType,
    direction: row.direction as CashOperationDirection,
    amount: money(row.amount),
    occurredAt: row.occurredAt,
    comment: row.comment,
    createdByMembershipId: row.createdByMembershipId,
    createdAt: row.createdAt,
  };
}

function mapTransfer(row: PrismaTransfer): AllocationTransferView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    paymentId: row.paymentId,
    fromAllocationId: row.fromAllocationId,
    toAllocationId: row.toAllocationId,
    amount: money(row.amount),
    fromTargetType: row.fromTargetType as PaymentAllocationTargetType,
    fromTargetId: row.fromTargetId,
    toTargetType: row.toTargetType as PaymentAllocationTargetType,
    toTargetId: row.toTargetId,
    actorMembershipId: row.actorMembershipId,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async listPaymentMethods(
    organizationId: string,
    activeOnly = false,
  ): Promise<PaymentMethodView[]> {
    const rows = await this.client().paymentMethod.findMany({
      where: { organizationId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map(mapMethod);
  }

  async getPaymentMethod(
    organizationId: string,
    methodId: string,
  ): Promise<PaymentMethodView | null> {
    const row = await this.client().paymentMethod.findFirst({
      where: { id: methodId, organizationId },
    });
    return row ? mapMethod(row) : null;
  }

  async findPaymentMethodByCode(
    organizationId: string,
    code: string,
  ): Promise<PaymentMethodView | null> {
    const row = await this.client().paymentMethod.findFirst({
      where: { organizationId, code },
    });
    return row ? mapMethod(row) : null;
  }

  async createPaymentMethod(input: {
    id: string;
    organizationId: string;
    code: string;
    name: string;
    type: PaymentMethodType;
    requiresExternalConfirmation?: boolean;
    sortOrder?: number;
  }): Promise<PaymentMethodView> {
    const row = await this.client().paymentMethod.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        code: input.code,
        name: input.name,
        type: input.type,
        requiresExternalConfirmation: input.requiresExternalConfirmation ?? false,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    return mapMethod(row);
  }

  async archivePaymentMethod(
    organizationId: string,
    methodId: string,
  ): Promise<PaymentMethodView> {
    await this.client().paymentMethod.updateMany({
      where: { id: methodId, organizationId },
      data: { isActive: false },
    });
    const row = await this.getPaymentMethod(organizationId, methodId);
    if (!row) throw new Error('Payment method not found after archive');
    return row;
  }

  async nextPaymentNumber(organizationId: string): Promise<string> {
    for (let i = 0; i < 8; i += 1) {
      const number = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const exists = await this.client().payment.findFirst({
        where: { organizationId, number },
      });
      if (!exists) return number;
    }
    throw new Error('Failed to allocate unique payment number');
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentView> {
    const row = await this.client().payment.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        storeId: input.storeId,
        number: input.number,
        type: input.type,
        status: 'DRAFT',
        direction: input.direction,
        methodId: input.methodId,
        amount: new Prisma.Decimal(input.amount),
        currencyCode: input.currencyCode,
        receivedAt: input.receivedAt,
        comment: input.comment,
        externalReference: input.externalReference,
        createdByMembershipId: input.createdByMembershipId,
        allocations: {
          create: input.allocations.map((allocation) => ({
            id: allocation.id,
            organizationId: input.organizationId,
            targetType: allocation.targetType,
            targetId: allocation.targetId,
            amount: new Prisma.Decimal(allocation.amount),
            isActive: true,
          })),
        },
      },
      include: { allocations: true },
    });
    return mapPayment(row);
  }

  async getPayment(
    organizationId: string,
    storeId: string,
    paymentId: string,
  ): Promise<PaymentView | null> {
    const row = await this.client().payment.findFirst({
      where: { id: paymentId, organizationId, storeId },
      include: { allocations: { orderBy: { createdAt: 'asc' } } },
    });
    return row ? mapPayment(row) : null;
  }

  async listPayments(
    organizationId: string,
    storeId: string,
    filter?: { status?: PaymentStatus; type?: PaymentType },
  ): Promise<PaymentView[]> {
    const rows = await this.client().payment.findMany({
      where: {
        organizationId,
        storeId,
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.type ? { type: filter.type } : {}),
      },
      include: { allocations: { orderBy: { createdAt: 'asc' } } },
      orderBy: { receivedAt: 'desc' },
    });
    return rows.map(mapPayment);
  }

  async markPaymentCompleted(input: {
    organizationId: string;
    storeId: string;
    paymentId: string;
    completedAt: Date;
  }): Promise<PaymentView> {
    await this.client().payment.updateMany({
      where: {
        id: input.paymentId,
        organizationId: input.organizationId,
        storeId: input.storeId,
      },
      data: { status: 'COMPLETED', completedAt: input.completedAt },
    });
    const row = await this.getPayment(input.organizationId, input.storeId, input.paymentId);
    if (!row) throw new Error('Payment not found after complete');
    return row;
  }

  async markPaymentAnnulled(input: {
    organizationId: string;
    storeId: string;
    paymentId: string;
    annulledAt: Date;
    annulReason: string;
  }): Promise<PaymentView> {
    await this.client().payment.updateMany({
      where: {
        id: input.paymentId,
        organizationId: input.organizationId,
        storeId: input.storeId,
      },
      data: {
        status: 'ANNULLED',
        annulledAt: input.annulledAt,
        annulReason: input.annulReason,
      },
    });
    const row = await this.getPayment(input.organizationId, input.storeId, input.paymentId);
    if (!row) throw new Error('Payment not found after annul');
    return row;
  }

  async deactivateAllocationsForPayment(
    organizationId: string,
    paymentId: string,
    supersededAt: Date,
  ): Promise<void> {
    await this.client().paymentAllocation.updateMany({
      where: { organizationId, paymentId, isActive: true },
      data: { isActive: false, supersededAt },
    });
  }

  async listActiveOrderAllocations(
    organizationId: string,
    orderId: string,
  ): Promise<PaymentAllocationView[]> {
    const rows = await this.client().paymentAllocation.findMany({
      where: {
        organizationId,
        targetType: 'ORDER',
        targetId: orderId,
        isActive: true,
        payment: { status: 'COMPLETED' },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapAllocation);
  }

  async supersedeAllocation(
    organizationId: string,
    allocationId: string,
    supersededAt: Date,
  ): Promise<PaymentAllocationView> {
    await this.client().paymentAllocation.updateMany({
      where: { id: allocationId, organizationId },
      data: { isActive: false, supersededAt },
    });
    const row = await this.client().paymentAllocation.findFirst({
      where: { id: allocationId, organizationId },
    });
    if (!row) throw new Error('Allocation not found after supersede');
    return mapAllocation(row);
  }

  async createAllocation(input: {
    id: string;
    organizationId: string;
    paymentId: string;
    targetType: PaymentAllocationTargetType;
    targetId: string;
    amount: string;
  }): Promise<PaymentAllocationView> {
    const row = await this.client().paymentAllocation.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        paymentId: input.paymentId,
        targetType: input.targetType,
        targetId: input.targetId,
        amount: new Prisma.Decimal(input.amount),
        isActive: true,
      },
    });
    return mapAllocation(row);
  }

  async createAllocationTransfer(input: {
    id: string;
    organizationId: string;
    paymentId: string;
    fromAllocationId: string;
    toAllocationId: string;
    amount: string;
    fromTargetType: PaymentAllocationTargetType;
    fromTargetId: string;
    toTargetType: PaymentAllocationTargetType;
    toTargetId: string;
    actorMembershipId: string | null;
    occurredAt: Date;
  }): Promise<AllocationTransferView> {
    const row = await this.client().paymentAllocationTransfer.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        paymentId: input.paymentId,
        fromAllocationId: input.fromAllocationId,
        toAllocationId: input.toAllocationId,
        amount: new Prisma.Decimal(input.amount),
        fromTargetType: input.fromTargetType,
        fromTargetId: input.fromTargetId,
        toTargetType: input.toTargetType,
        toTargetId: input.toTargetId,
        actorMembershipId: input.actorMembershipId,
        occurredAt: input.occurredAt,
      },
    });
    return mapTransfer(row);
  }

  async createRefund(input: CreateRefundInput): Promise<PaymentRefundView> {
    const row = await this.client().paymentRefund.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        storeId: input.storeId,
        originalPaymentId: input.originalPaymentId,
        amount: new Prisma.Decimal(input.amount),
        reason: input.reason,
        status: 'DRAFT',
        methodId: input.methodId,
        externalReference: input.externalReference,
        createdByMembershipId: input.createdByMembershipId,
      },
    });
    return mapRefund(row);
  }

  async getRefund(
    organizationId: string,
    storeId: string,
    refundId: string,
  ): Promise<PaymentRefundView | null> {
    const row = await this.client().paymentRefund.findFirst({
      where: { id: refundId, organizationId, storeId },
    });
    return row ? mapRefund(row) : null;
  }

  async listRefundsForPayment(
    organizationId: string,
    storeId: string,
    paymentId: string,
  ): Promise<PaymentRefundView[]> {
    const rows = await this.client().paymentRefund.findMany({
      where: { organizationId, storeId, originalPaymentId: paymentId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapRefund);
  }

  async markRefundCompleted(input: {
    organizationId: string;
    storeId: string;
    refundId: string;
    completedAt: Date;
  }): Promise<PaymentRefundView> {
    await this.client().paymentRefund.updateMany({
      where: {
        id: input.refundId,
        organizationId: input.organizationId,
        storeId: input.storeId,
      },
      data: { status: 'COMPLETED', completedAt: input.completedAt },
    });
    const row = await this.getRefund(input.organizationId, input.storeId, input.refundId);
    if (!row) throw new Error('Refund not found after complete');
    return row;
  }

  async markRefundAnnulled(input: {
    organizationId: string;
    storeId: string;
    refundId: string;
    annulledAt: Date;
    annulReason: string;
  }): Promise<PaymentRefundView> {
    await this.client().paymentRefund.updateMany({
      where: {
        id: input.refundId,
        organizationId: input.organizationId,
        storeId: input.storeId,
      },
      data: {
        status: 'ANNULLED',
        annulledAt: input.annulledAt,
        annulReason: input.annulReason,
      },
    });
    const row = await this.getRefund(input.organizationId, input.storeId, input.refundId);
    if (!row) throw new Error('Refund not found after annul');
    return row;
  }

  async appendTimeline(input: {
    id: string;
    organizationId: string;
    paymentId: string;
    type: string;
    message: string | null;
    actorMembershipId: string | null;
    payload: unknown;
    occurredAt: Date;
  }): Promise<PaymentTimelineEventView> {
    const row = await this.client().paymentTimelineEvent.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        paymentId: input.paymentId,
        type: input.type as PrismaTimeline['type'],
        message: input.message,
        actorMembershipId: input.actorMembershipId,
        payload:
          input.payload === null || input.payload === undefined
            ? undefined
            : (input.payload as Prisma.InputJsonValue),
        occurredAt: input.occurredAt,
      },
    });
    return mapTimeline(row);
  }

  async listTimeline(
    organizationId: string,
    paymentId: string,
  ): Promise<PaymentTimelineEventView[]> {
    const rows = await this.client().paymentTimelineEvent.findMany({
      where: { organizationId, paymentId },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map(mapTimeline);
  }

  async ensureDefaultCashAccount(input: {
    id: string;
    organizationId: string;
    storeId: string;
    name: string;
    type: CashAccountType;
  }): Promise<CashAccountView> {
    const existing = await this.getActiveCashRegister(input.organizationId, input.storeId);
    if (existing) return existing;
    const row = await this.client().cashAccount.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        storeId: input.storeId,
        name: input.name,
        type: input.type,
        status: 'ACTIVE',
      },
    });
    return mapCashAccount(row);
  }

  async listCashAccounts(
    organizationId: string,
    storeId: string,
  ): Promise<CashAccountView[]> {
    const rows = await this.client().cashAccount.findMany({
      where: { organizationId, storeId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapCashAccount);
  }

  async getActiveCashRegister(
    organizationId: string,
    storeId: string,
  ): Promise<CashAccountView | null> {
    const row = await this.client().cashAccount.findFirst({
      where: {
        organizationId,
        storeId,
        type: 'CASH_REGISTER',
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'asc' },
    });
    return row ? mapCashAccount(row) : null;
  }

  async createCashOperation(input: CreateCashOperationInput): Promise<CashOperationView> {
    const row = await this.client().cashOperation.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        storeId: input.storeId,
        cashAccountId: input.cashAccountId,
        paymentId: input.paymentId,
        refundId: input.refundId,
        type: input.type,
        direction: input.direction,
        amount: new Prisma.Decimal(input.amount),
        occurredAt: input.occurredAt,
        comment: input.comment,
        createdByMembershipId: input.createdByMembershipId,
      },
    });
    return mapCashOperation(row);
  }

  async listCashOperations(
    organizationId: string,
    storeId: string,
    cashAccountId?: string,
  ): Promise<CashOperationView[]> {
    const rows = await this.client().cashOperation.findMany({
      where: {
        organizationId,
        storeId,
        ...(cashAccountId ? { cashAccountId } : {}),
      },
      orderBy: { occurredAt: 'desc' },
    });
    return rows.map(mapCashOperation);
  }

  async sumActiveCompletedAllocationsForTarget(
    organizationId: string,
    targetType: PaymentAllocationTargetType,
    targetId: string,
  ): Promise<string> {
    const rows = await this.client().paymentAllocation.findMany({
      where: {
        organizationId,
        targetType,
        targetId,
        isActive: true,
        payment: { status: 'COMPLETED' },
      },
      select: { amount: true },
    });
    return rows
      .reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0))
      .toFixed(2);
  }

  async sumCompletedRefundsForPayment(
    organizationId: string,
    paymentId: string,
  ): Promise<string> {
    const rows = await this.client().paymentRefund.findMany({
      where: { organizationId, originalPaymentId: paymentId, status: 'COMPLETED' },
      select: { amount: true },
    });
    return rows
      .reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0))
      .toFixed(2);
  }

  async sumCompletedRefundsForTarget(
    organizationId: string,
    targetType: PaymentAllocationTargetType,
    targetId: string,
  ): Promise<string> {
    const allocations = await this.client().paymentAllocation.findMany({
      where: { organizationId, targetType, targetId },
      select: { paymentId: true },
      distinct: ['paymentId'],
    });
    if (allocations.length === 0) return '0.00';
    const paymentIds = allocations.map((row) => row.paymentId);
    const rows = await this.client().paymentRefund.findMany({
      where: {
        organizationId,
        originalPaymentId: { in: paymentIds },
        status: 'COMPLETED',
      },
      select: { amount: true },
    });
    return rows
      .reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0))
      .toFixed(2);
  }

  async countCompletedRefunds(organizationId: string, paymentId: string): Promise<number> {
    return this.client().paymentRefund.count({
      where: { organizationId, originalPaymentId: paymentId, status: 'COMPLETED' },
    });
  }

  async findIdempotency(
    organizationId: string,
    scope: string,
    key: string,
  ): Promise<IdempotencyRecord | null> {
    const row = await this.client().postingIdempotencyKey.findFirst({
      where: { organizationId, scope, key },
    });
    return row
      ? {
          id: row.id,
          organizationId: row.organizationId,
          scope: row.scope,
          key: row.key,
          documentId: row.documentId,
        }
      : null;
  }

  async createIdempotency(input: {
    id: string;
    organizationId: string;
    scope: string;
    key: string;
    documentId: string;
  }): Promise<IdempotencyRecord> {
    const row = await this.client().postingIdempotencyKey.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        scope: input.scope,
        key: input.key,
        documentId: input.documentId,
      },
    });
    return {
      id: row.id,
      organizationId: row.organizationId,
      scope: row.scope,
      key: row.key,
      documentId: row.documentId,
    };
  }
}
