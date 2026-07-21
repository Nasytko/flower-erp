import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CLOCK_PORT, Money, type ClockPort } from '@flower/shared-kernel';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import {
  CashAccountType,
  CashOperationDirection,
  CashOperationType,
  DomainError,
  PaymentAllocationTargetType,
  PaymentDirection,
  PaymentMethodType,
  PaymentRefundStatus,
  PaymentStatus,
  PaymentStatusProjection,
  PaymentTimelineEventType,
  PaymentType,
  assertAllocationsEqualPayment,
  assertAmountPositive,
  assertCanAnnul,
  assertCanComplete,
  assertCanRefund,
  assertCurrencyByn,
  assertNoOverpayment,
  assertOrderAcceptsPrepayment,
  assertRefundCanAnnul,
  assertRefundCanComplete,
  assertRefundWithinLimit,
  assertSaleAcceptsPayment,
  computePaymentStatusProjection,
} from '../domain/payment-rules';
import {
  ORDERS_PAYMENT_PORT,
  type OrdersPaymentPort,
} from './ports/orders-payment.port';
import {
  PAYMENT_DEPENDENCY_PORT,
  type PaymentDependencyPort,
} from './ports/payment-dependency.port';
import {
  PAYMENT_REPOSITORY,
  type PaymentRepository,
  type PaymentRefundView,
  type PaymentView,
} from './ports/payment.repository';
import {
  SALES_PAYMENT_PORT,
  type SalesPaymentPort,
} from './ports/sales-payment.port';

function mapDomain(error: unknown): never {
  const coded =
    error instanceof DomainError
      ? error
      : error instanceof Error &&
          'code' in error &&
          typeof (error as { code: unknown }).code === 'string'
        ? (error as Error & { code: string })
        : null;
  if (coded) {
    if (
      coded.code.includes('NOT_') ||
      coded.code.includes('INVALID') ||
      coded.code.includes('REQUIRED') ||
      coded.code.includes('UNSUPPORTED') ||
      coded.code.includes('DOES_NOT')
    ) {
      throw new BadRequestException({ code: coded.code, message: coded.message });
    }
    throw new ConflictException({ code: coded.code, message: coded.message });
  }
  throw error;
}

function actorMembershipId(): string | null {
  return getRequestContext()?.auth?.membershipId ?? null;
}

function requireIdempotencyKey(key: string | undefined): string {
  const trimmed = key?.trim() ?? '';
  if (!trimmed) {
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Idempotency-Key header is required',
    });
  }
  return trimmed;
}

const DEFAULT_METHODS: Array<{
  code: string;
  name: string;
  type: PaymentMethodType;
  sortOrder: number;
}> = [
  { code: 'CASH', name: 'Cash', type: PaymentMethodType.CASH, sortOrder: 10 },
  { code: 'BANK_CARD', name: 'Bank card', type: PaymentMethodType.BANK_CARD, sortOrder: 20 },
  {
    code: 'BANK_TRANSFER',
    name: 'Bank transfer',
    type: PaymentMethodType.BANK_TRANSFER,
    sortOrder: 30,
  },
];

export type PaymentSummaryView = {
  targetType: PaymentAllocationTargetType;
  targetId: string;
  totalAmount: string;
  paidAmount: string;
  refundedAmount: string;
  balanceDue: string;
  status: PaymentStatusProjection;
};

@Injectable()
export class PaymentUseCases {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(ORDERS_PAYMENT_PORT) private readonly ordersPayment: OrdersPaymentPort,
    @Inject(SALES_PAYMENT_PORT) private readonly salesPayment: SalesPaymentPort,
    @Inject(PAYMENT_DEPENDENCY_PORT) private readonly dependencies: PaymentDependencyPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    private readonly organizations: OrganizationUseCases,
  ) {}

  async ensureDefaultPaymentMethods(organizationId: string) {
    await this.organizations.getOrganization(organizationId);
    const created = [];
    for (const method of DEFAULT_METHODS) {
      const existing = await this.payments.findPaymentMethodByCode(organizationId, method.code);
      if (existing) {
        created.push(existing);
        continue;
      }
      created.push(
        await this.payments.createPaymentMethod({
          id: randomUUID(),
          organizationId,
          code: method.code,
          name: method.name,
          type: method.type,
          sortOrder: method.sortOrder,
        }),
      );
    }
    return created;
  }

  async ensureDefaultCashAccount(organizationId: string, storeId: string) {
    await this.organizations.getStore(organizationId, storeId);
    return this.payments.ensureDefaultCashAccount({
      id: randomUUID(),
      organizationId,
      storeId,
      name: 'Касса магазина',
      type: CashAccountType.CASH_REGISTER,
    });
  }

  async listPaymentMethods(organizationId: string, activeOnly = false) {
    await this.organizations.getOrganization(organizationId);
    return this.payments.listPaymentMethods(organizationId, activeOnly);
  }

  async createPaymentMethod(input: {
    organizationId: string;
    code: string;
    name: string;
    type: PaymentMethodType;
    requiresExternalConfirmation?: boolean;
    sortOrder?: number;
  }) {
    await this.organizations.getOrganization(input.organizationId);
    const code = input.code.trim().toUpperCase();
    if (!code) {
      throw new BadRequestException({ code: 'METHOD_CODE_REQUIRED', message: 'code is required' });
    }
    const existing = await this.payments.findPaymentMethodByCode(input.organizationId, code);
    if (existing) {
      throw new ConflictException({
        code: 'PAYMENT_METHOD_EXISTS',
        message: 'Payment method code already exists',
      });
    }
    const method = await this.payments.createPaymentMethod({
      id: randomUUID(),
      organizationId: input.organizationId,
      code,
      name: input.name.trim(),
      type: input.type,
      requiresExternalConfirmation: input.requiresExternalConfirmation,
      sortOrder: input.sortOrder,
    });
    await this.audit.append({
      organizationId: input.organizationId,
      actorId: getRequestContext()?.actorId ?? null,
      action: 'PAYMENT_METHOD_CREATED',
      entityType: 'PaymentMethod',
      entityId: method.id,
      beforeState: null,
      afterState: method as unknown as Record<string, unknown>,
      requestId: getRequestContext()?.requestId ?? 'unknown',
      occurredAt: this.clock.now(),
    });
    return method;
  }

  async archivePaymentMethod(organizationId: string, methodId: string) {
    await this.organizations.getOrganization(organizationId);
    const existing = await this.payments.getPaymentMethod(organizationId, methodId);
    if (!existing) {
      throw new NotFoundException({
        code: 'PAYMENT_METHOD_NOT_FOUND',
        message: 'Payment method not found',
      });
    }
    const archived = await this.payments.archivePaymentMethod(organizationId, methodId);
    await this.audit.append({
      organizationId,
      actorId: getRequestContext()?.actorId ?? null,
      action: 'PAYMENT_METHOD_ARCHIVED',
      entityType: 'PaymentMethod',
      entityId: methodId,
      beforeState: existing as unknown as Record<string, unknown>,
      afterState: archived as unknown as Record<string, unknown>,
      requestId: getRequestContext()?.requestId ?? 'unknown',
      occurredAt: this.clock.now(),
    });
    return archived;
  }

  async createPayment(input: {
    organizationId: string;
    storeId: string;
    type: PaymentType;
    methodId: string;
    amount: string;
    currencyCode?: string;
    receivedAt?: string;
    comment?: string | null;
    externalReference?: string | null;
    allocations: Array<{
      targetType: PaymentAllocationTargetType;
      targetId: string;
      amount: string;
    }>;
  }): Promise<PaymentView> {
    await this.organizations.getStore(input.organizationId, input.storeId);
    try {
      assertCurrencyByn(input.currencyCode ?? 'BYN');
      assertAmountPositive(input.amount);
      assertAllocationsEqualPayment(
        input.amount,
        input.allocations.map((row) => row.amount),
      );
      for (const allocation of input.allocations) {
        assertAmountPositive(allocation.amount);
      }
    } catch (error) {
      mapDomain(error);
    }

    if (
      input.type !== PaymentType.ORDER_PREPAYMENT &&
      input.type !== PaymentType.SALE_PAYMENT
    ) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_PAYMENT_TYPE',
        message: 'Only ORDER_PREPAYMENT and SALE_PAYMENT are supported in v1',
      });
    }

    const method = await this.payments.getPaymentMethod(input.organizationId, input.methodId);
    if (!method || !method.isActive) {
      throw new BadRequestException({
        code: 'PAYMENT_METHOD_INACTIVE',
        message: 'Payment method must be active',
      });
    }

    for (const allocation of input.allocations) {
      await this.validateAllocationTarget(
        input.organizationId,
        input.storeId,
        input.type,
        allocation.targetType,
        allocation.targetId,
      );
    }

    try {
      return await this.uow.runInTransaction(async () => {
        const payment = await this.payments.createPayment({
          id: randomUUID(),
          organizationId: input.organizationId,
          storeId: input.storeId,
          number: await this.payments.nextPaymentNumber(input.organizationId),
          type: input.type,
          direction: PaymentDirection.IN,
          methodId: input.methodId,
          amount: new Money(input.amount).toFixed(2),
          currencyCode: 'BYN',
          receivedAt: input.receivedAt ? new Date(input.receivedAt) : this.clock.now(),
          comment: input.comment ?? null,
          externalReference: input.externalReference ?? null,
          createdByMembershipId: actorMembershipId(),
          allocations: input.allocations.map((allocation) => ({
            id: randomUUID(),
            targetType: allocation.targetType,
            targetId: allocation.targetId,
            amount: new Money(allocation.amount).toFixed(2),
          })),
        });

        await this.appendTimeline(
          payment,
          PaymentTimelineEventType.PAYMENT_CREATED,
          'Payment created',
          null,
        );
        for (const allocation of payment.allocations) {
          await this.appendTimeline(
            payment,
            allocation.targetType === PaymentAllocationTargetType.ORDER
              ? PaymentTimelineEventType.PAYMENT_ALLOCATED_TO_ORDER
              : PaymentTimelineEventType.PAYMENT_ALLOCATED_TO_SALE,
            `Allocated to ${allocation.targetType.toLowerCase()}`,
            { allocationId: allocation.id, targetId: allocation.targetId },
          );
        }
        await this.auditPayment(payment, 'PAYMENT_CREATED', null, payment);
        return payment;
      });
    } catch (error) {
      mapDomain(error);
    }
  }

  async createOrderPrepayment(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    methodId: string;
    amount: string;
    comment?: string | null;
    externalReference?: string | null;
    receivedAt?: string;
  }): Promise<PaymentView> {
    return this.createPayment({
      organizationId: input.organizationId,
      storeId: input.storeId,
      type: PaymentType.ORDER_PREPAYMENT,
      methodId: input.methodId,
      amount: input.amount,
      comment: input.comment,
      externalReference: input.externalReference,
      receivedAt: input.receivedAt,
      allocations: [
        {
          targetType: PaymentAllocationTargetType.ORDER,
          targetId: input.orderId,
          amount: input.amount,
        },
      ],
    });
  }

  async createSalePayment(input: {
    organizationId: string;
    storeId: string;
    saleId: string;
    methodId: string;
    amount: string;
    comment?: string | null;
    externalReference?: string | null;
    receivedAt?: string;
  }): Promise<PaymentView> {
    return this.createPayment({
      organizationId: input.organizationId,
      storeId: input.storeId,
      type: PaymentType.SALE_PAYMENT,
      methodId: input.methodId,
      amount: input.amount,
      comment: input.comment,
      externalReference: input.externalReference,
      receivedAt: input.receivedAt,
      allocations: [
        {
          targetType: PaymentAllocationTargetType.SALE,
          targetId: input.saleId,
          amount: input.amount,
        },
      ],
    });
  }

  async completePayment(input: {
    organizationId: string;
    storeId: string;
    paymentId: string;
    idempotencyKey: string;
  }): Promise<PaymentView> {
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const existing = await this.requirePayment(
      input.organizationId,
      input.storeId,
      input.paymentId,
    );
    if (existing.status === PaymentStatus.COMPLETED) {
      return existing;
    }

    try {
      assertCanComplete(existing.status);
    } catch (error) {
      mapDomain(error);
    }

    return this.uow.runInTransaction(async () => {
      const replay = await this.claimIdempotency(
        input.organizationId,
        'payment-complete',
        idempotencyKey,
        input.paymentId,
      );
      const payment = await this.requirePayment(
        input.organizationId,
        input.storeId,
        input.paymentId,
      );
      if (replay || payment.status === PaymentStatus.COMPLETED) {
        return payment;
      }
      try {
        assertCanComplete(payment.status);
      } catch (error) {
        mapDomain(error);
      }

      const method = await this.payments.getPaymentMethod(
        input.organizationId,
        payment.methodId,
      );
      if (!method?.isActive) {
        throw new BadRequestException({
          code: 'PAYMENT_METHOD_INACTIVE',
          message: 'Payment method must be active',
        });
      }

      await this.assertNoOverpaymentForPayment(payment);

      const now = this.clock.now();
      const cashAccount = await this.ensureDefaultCashAccount(
        input.organizationId,
        input.storeId,
      );
      await this.payments.createCashOperation({
        id: randomUUID(),
        organizationId: input.organizationId,
        storeId: input.storeId,
        cashAccountId: cashAccount.id,
        paymentId: payment.id,
        refundId: null,
        type: CashOperationType.PAYMENT_RECEIPT,
        direction: CashOperationDirection.IN,
        amount: payment.amount,
        occurredAt: now,
        comment: null,
        createdByMembershipId: actorMembershipId(),
      });

      const completed = await this.payments.markPaymentCompleted({
        organizationId: input.organizationId,
        storeId: input.storeId,
        paymentId: payment.id,
        completedAt: now,
      });

      await this.appendTimeline(
        completed,
        PaymentTimelineEventType.PAYMENT_COMPLETED,
        'Payment completed',
        null,
      );
      await this.notifyTargets(completed, PaymentStatus.COMPLETED, now);
      await this.auditPayment(completed, 'PAYMENT_COMPLETED', payment, completed);
      return completed;
    });
  }

  async annulPayment(input: {
    organizationId: string;
    storeId: string;
    paymentId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<PaymentView> {
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'ANNUL_REASON_REQUIRED',
        message: 'Annul reason is required',
      });
    }

    const existing = await this.requirePayment(
      input.organizationId,
      input.storeId,
      input.paymentId,
    );
    if (existing.status === PaymentStatus.ANNULLED) {
      return existing;
    }

    try {
      assertCanAnnul(existing.status);
    } catch (error) {
      mapDomain(error);
    }

    return this.uow.runInTransaction(async () => {
      const replay = await this.claimIdempotency(
        input.organizationId,
        'payment-annul',
        idempotencyKey,
        input.paymentId,
      );
      const payment = await this.requirePayment(
        input.organizationId,
        input.storeId,
        input.paymentId,
      );
      if (replay || payment.status === PaymentStatus.ANNULLED) {
        return payment;
      }
      try {
        assertCanAnnul(payment.status);
      } catch (error) {
        mapDomain(error);
      }

      const completedRefunds = await this.payments.countCompletedRefunds(
        input.organizationId,
        payment.id,
      );
      if (completedRefunds > 0) {
        throw new ConflictException({
          code: 'PAYMENT_HAS_COMPLETED_REFUNDS',
          message: 'Cannot annul payment with completed refunds',
        });
      }

      await this.dependencies.assertNoBlockingDependencies(payment.id);

      const now = this.clock.now();
      const cashAccount = await this.ensureDefaultCashAccount(
        input.organizationId,
        input.storeId,
      );
      await this.payments.createCashOperation({
        id: randomUUID(),
        organizationId: input.organizationId,
        storeId: input.storeId,
        cashAccountId: cashAccount.id,
        paymentId: payment.id,
        refundId: null,
        type: CashOperationType.PAYMENT_ANNULMENT_REVERSAL,
        direction: CashOperationDirection.OUT,
        amount: payment.amount,
        occurredAt: now,
        comment: reason,
        createdByMembershipId: actorMembershipId(),
      });

      await this.payments.deactivateAllocationsForPayment(
        input.organizationId,
        payment.id,
        now,
      );

      const annulled = await this.payments.markPaymentAnnulled({
        organizationId: input.organizationId,
        storeId: input.storeId,
        paymentId: payment.id,
        annulledAt: now,
        annulReason: reason,
      });

      await this.appendTimeline(
        annulled,
        PaymentTimelineEventType.PAYMENT_ANNULLED,
        reason,
        null,
      );
      await this.notifyTargets(annulled, PaymentStatus.ANNULLED, now);
      await this.auditPayment(annulled, 'PAYMENT_ANNULLED', payment, annulled, reason);
      return annulled;
    });
  }

  async createRefund(input: {
    organizationId: string;
    storeId: string;
    paymentId: string;
    amount: string;
    reason: string;
    methodId?: string;
    externalReference?: string | null;
  }): Promise<PaymentRefundView> {
    const payment = await this.requirePayment(
      input.organizationId,
      input.storeId,
      input.paymentId,
    );
    try {
      assertCanRefund(payment.status);
      assertAmountPositive(input.amount);
    } catch (error) {
      mapDomain(error);
    }

    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'REFUND_REASON_REQUIRED',
        message: 'Refund reason is required',
      });
    }

    const methodId = input.methodId ?? payment.methodId;
    const method = await this.payments.getPaymentMethod(input.organizationId, methodId);
    if (!method?.isActive) {
      throw new BadRequestException({
        code: 'PAYMENT_METHOD_INACTIVE',
        message: 'Payment method must be active',
      });
    }

    const completedRefunds = await this.payments.sumCompletedRefundsForPayment(
      input.organizationId,
      payment.id,
    );
    try {
      assertRefundWithinLimit(payment.amount, completedRefunds, input.amount);
    } catch (error) {
      mapDomain(error);
    }

    return this.uow.runInTransaction(async () => {
      const refund = await this.payments.createRefund({
        id: randomUUID(),
        organizationId: input.organizationId,
        storeId: input.storeId,
        originalPaymentId: payment.id,
        amount: new Money(input.amount).toFixed(2),
        reason,
        methodId,
        externalReference: input.externalReference ?? null,
        createdByMembershipId: actorMembershipId(),
      });
      await this.appendTimeline(
        payment,
        PaymentTimelineEventType.REFUND_CREATED,
        'Refund created',
        { refundId: refund.id },
      );
      await this.audit.append({
        organizationId: input.organizationId,
        storeId: input.storeId,
        actorId: getRequestContext()?.actorId ?? null,
        action: 'PAYMENT_REFUND_CREATED',
        entityType: 'PaymentRefund',
        entityId: refund.id,
        beforeState: null,
        afterState: refund as unknown as Record<string, unknown>,
        requestId: getRequestContext()?.requestId ?? 'unknown',
        occurredAt: this.clock.now(),
      });
      return refund;
    });
  }

  async completeRefund(input: {
    organizationId: string;
    storeId: string;
    refundId: string;
    idempotencyKey: string;
  }): Promise<PaymentRefundView> {
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const existing = await this.requireRefund(
      input.organizationId,
      input.storeId,
      input.refundId,
    );
    if (existing.status === PaymentRefundStatus.COMPLETED) {
      return existing;
    }

    try {
      assertRefundCanComplete(existing.status);
    } catch (error) {
      mapDomain(error);
    }

    return this.uow.runInTransaction(async () => {
      const replay = await this.claimIdempotency(
        input.organizationId,
        'refund-complete',
        idempotencyKey,
        input.refundId,
      );
      const refund = await this.requireRefund(
        input.organizationId,
        input.storeId,
        input.refundId,
      );
      if (replay || refund.status === PaymentRefundStatus.COMPLETED) {
        return refund;
      }
      try {
        assertRefundCanComplete(refund.status);
      } catch (error) {
        mapDomain(error);
      }

      const payment = await this.requirePayment(
        input.organizationId,
        input.storeId,
        refund.originalPaymentId,
      );
      const completedRefunds = await this.payments.sumCompletedRefundsForPayment(
        input.organizationId,
        payment.id,
      );
      try {
        assertRefundWithinLimit(payment.amount, completedRefunds, refund.amount);
      } catch (error) {
        mapDomain(error);
      }

      const now = this.clock.now();
      const cashAccount = await this.ensureDefaultCashAccount(
        input.organizationId,
        input.storeId,
      );
      await this.payments.createCashOperation({
        id: randomUUID(),
        organizationId: input.organizationId,
        storeId: input.storeId,
        cashAccountId: cashAccount.id,
        paymentId: payment.id,
        refundId: refund.id,
        type: CashOperationType.REFUND_PAYMENT,
        direction: CashOperationDirection.OUT,
        amount: refund.amount,
        occurredAt: now,
        comment: refund.reason,
        createdByMembershipId: actorMembershipId(),
      });

      const completed = await this.payments.markRefundCompleted({
        organizationId: input.organizationId,
        storeId: input.storeId,
        refundId: refund.id,
        completedAt: now,
      });

      await this.appendTimeline(
        payment,
        PaymentTimelineEventType.REFUND_COMPLETED,
        'Refund completed',
        { refundId: completed.id },
      );
      await this.audit.append({
        organizationId: input.organizationId,
        storeId: input.storeId,
        actorId: getRequestContext()?.actorId ?? null,
        action: 'PAYMENT_REFUND_COMPLETED',
        entityType: 'PaymentRefund',
        entityId: completed.id,
        beforeState: refund as unknown as Record<string, unknown>,
        afterState: completed as unknown as Record<string, unknown>,
        requestId: getRequestContext()?.requestId ?? 'unknown',
        occurredAt: now,
      });
      return completed;
    });
  }

  async annulRefund(input: {
    organizationId: string;
    storeId: string;
    refundId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<PaymentRefundView> {
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'ANNUL_REASON_REQUIRED',
        message: 'Annul reason is required',
      });
    }

    const existing = await this.requireRefund(
      input.organizationId,
      input.storeId,
      input.refundId,
    );
    if (existing.status === PaymentRefundStatus.ANNULLED) {
      return existing;
    }

    try {
      assertRefundCanAnnul(existing.status);
    } catch (error) {
      mapDomain(error);
    }

    return this.uow.runInTransaction(async () => {
      const replay = await this.claimIdempotency(
        input.organizationId,
        'refund-annul',
        idempotencyKey,
        input.refundId,
      );
      const refund = await this.requireRefund(
        input.organizationId,
        input.storeId,
        input.refundId,
      );
      if (replay || refund.status === PaymentRefundStatus.ANNULLED) {
        return refund;
      }
      try {
        assertRefundCanAnnul(refund.status);
      } catch (error) {
        mapDomain(error);
      }

      const now = this.clock.now();
      if (refund.status === PaymentRefundStatus.COMPLETED) {
        const cashAccount = await this.ensureDefaultCashAccount(
          input.organizationId,
          input.storeId,
        );
        await this.payments.createCashOperation({
          id: randomUUID(),
          organizationId: input.organizationId,
          storeId: input.storeId,
          cashAccountId: cashAccount.id,
          paymentId: refund.originalPaymentId,
          refundId: refund.id,
          type: CashOperationType.MANUAL_INCOME,
          direction: CashOperationDirection.IN,
          amount: refund.amount,
          occurredAt: now,
          comment: `Refund annulment: ${reason}`,
          createdByMembershipId: actorMembershipId(),
        });
      }

      const annulled = await this.payments.markRefundAnnulled({
        organizationId: input.organizationId,
        storeId: input.storeId,
        refundId: refund.id,
        annulledAt: now,
        annulReason: reason,
      });

      const payment = await this.requirePayment(
        input.organizationId,
        input.storeId,
        refund.originalPaymentId,
      );
      await this.appendTimeline(
        payment,
        PaymentTimelineEventType.REFUND_ANNULLED,
        reason,
        { refundId: annulled.id },
      );
      await this.audit.append({
        organizationId: input.organizationId,
        storeId: input.storeId,
        actorId: getRequestContext()?.actorId ?? null,
        action: 'PAYMENT_REFUND_ANNULLED',
        entityType: 'PaymentRefund',
        entityId: annulled.id,
        beforeState: refund as unknown as Record<string, unknown>,
        afterState: annulled as unknown as Record<string, unknown>,
        reason,
        requestId: getRequestContext()?.requestId ?? 'unknown',
        occurredAt: now,
      });
      return annulled;
    });
  }

  async allocateOrderPrepaymentsToSale(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    saleId?: string;
    idempotencyKey: string;
  }): Promise<PaymentView[]> {
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    await this.organizations.getStore(input.organizationId, input.storeId);

    const saleId =
      input.saleId ??
      (await this.salesPayment.findActiveSaleIdByOrderId(
        input.organizationId,
        input.storeId,
        input.orderId,
      ));
    if (!saleId) {
      throw new BadRequestException({
        code: 'SALE_REQUIRED_FOR_TRANSFER',
        message: 'Active sale is required to allocate order prepayments',
      });
    }

    const sale = await this.salesPayment.getSalePaymentTarget(
      input.organizationId,
      input.storeId,
      saleId,
    );
    if (!sale || sale.orderId !== input.orderId) {
      throw new BadRequestException({
        code: 'SALE_ORDER_MISMATCH',
        message: 'Sale is not linked to the given order',
      });
    }

    return this.uow.runInTransaction(async () => {
      const replay = await this.claimIdempotency(
        input.organizationId,
        'prepayment-transfer',
        idempotencyKey,
        saleId,
      );
      if (replay) {
        const existing = await this.payments.listPayments(input.organizationId, input.storeId);
        return existing.filter((payment) =>
          payment.allocations.some(
            (allocation) =>
              allocation.targetType === PaymentAllocationTargetType.SALE &&
              allocation.targetId === saleId &&
              allocation.isActive,
          ),
        );
      }

      const allocations = await this.payments.listActiveOrderAllocations(
        input.organizationId,
        input.orderId,
      );
      if (allocations.length === 0) {
        return [];
      }

      const now = this.clock.now();
      const touchedPaymentIds = new Set<string>();

      for (const allocation of allocations) {
        await this.payments.supersedeAllocation(
          input.organizationId,
          allocation.id,
          now,
        );
        const toAllocation = await this.payments.createAllocation({
          id: randomUUID(),
          organizationId: input.organizationId,
          paymentId: allocation.paymentId,
          targetType: PaymentAllocationTargetType.SALE,
          targetId: saleId,
          amount: allocation.amount,
        });
        await this.payments.createAllocationTransfer({
          id: randomUUID(),
          organizationId: input.organizationId,
          paymentId: allocation.paymentId,
          fromAllocationId: allocation.id,
          toAllocationId: toAllocation.id,
          amount: allocation.amount,
          fromTargetType: PaymentAllocationTargetType.ORDER,
          fromTargetId: input.orderId,
          toTargetType: PaymentAllocationTargetType.SALE,
          toTargetId: saleId,
          actorMembershipId: actorMembershipId(),
          occurredAt: now,
        });
        touchedPaymentIds.add(allocation.paymentId);
      }

      const payments: PaymentView[] = [];
      for (const paymentId of touchedPaymentIds) {
        const payment = await this.requirePayment(
          input.organizationId,
          input.storeId,
          paymentId,
        );
        await this.appendTimeline(
          payment,
          PaymentTimelineEventType.PREPAYMENT_TRANSFERRED,
          'Order prepayment allocated to sale',
          { orderId: input.orderId, saleId },
        );
        await this.auditPayment(
          payment,
          'PREPAYMENT_TRANSFERRED',
          null,
          { orderId: input.orderId, saleId, paymentId },
        );
        payments.push(payment);
      }
      return payments;
    });
  }

  async getPayment(organizationId: string, storeId: string, paymentId: string) {
    return this.requirePayment(organizationId, storeId, paymentId);
  }

  async listPayments(
    organizationId: string,
    storeId: string,
    filter?: { status?: PaymentStatus; type?: PaymentType },
  ) {
    await this.organizations.getStore(organizationId, storeId);
    return this.payments.listPayments(organizationId, storeId, filter);
  }

  async getTimeline(organizationId: string, storeId: string, paymentId: string) {
    await this.requirePayment(organizationId, storeId, paymentId);
    return this.payments.listTimeline(organizationId, paymentId);
  }

  async getOrderPaymentSummary(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<PaymentSummaryView> {
    const order = await this.ordersPayment.getOrderPaymentTarget(
      organizationId,
      storeId,
      orderId,
    );
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }
    if (!order.totalAmount) {
      throw new BadRequestException({
        code: 'ORDER_TOTAL_REQUIRED',
        message: 'Order planned price is required for payment summary',
      });
    }
    return this.buildSummary(
      organizationId,
      PaymentAllocationTargetType.ORDER,
      orderId,
      order.totalAmount,
    );
  }

  async getSalePaymentSummary(
    organizationId: string,
    storeId: string,
    saleId: string,
  ): Promise<PaymentSummaryView> {
    const sale = await this.salesPayment.getSalePaymentTarget(
      organizationId,
      storeId,
      saleId,
    );
    if (!sale) {
      throw new NotFoundException({ code: 'SALE_NOT_FOUND', message: 'Sale not found' });
    }
    return this.buildSummary(
      organizationId,
      PaymentAllocationTargetType.SALE,
      saleId,
      sale.netAmount,
    );
  }

  async listCashAccounts(organizationId: string, storeId: string) {
    await this.organizations.getStore(organizationId, storeId);
    return this.payments.listCashAccounts(organizationId, storeId);
  }

  async listRefunds(organizationId: string, storeId: string, paymentId: string) {
    await this.requirePayment(organizationId, storeId, paymentId);
    return this.payments.listRefundsForPayment(organizationId, storeId, paymentId);
  }

  async listCashOperations(
    organizationId: string,
    storeId: string,
    cashAccountId?: string,
  ) {
    await this.organizations.getStore(organizationId, storeId);
    return this.payments.listCashOperations(organizationId, storeId, cashAccountId);
  }

  private async buildSummary(
    organizationId: string,
    targetType: PaymentAllocationTargetType,
    targetId: string,
    totalAmount: string,
  ): Promise<PaymentSummaryView> {
    const paidAmount = await this.payments.sumActiveCompletedAllocationsForTarget(
      organizationId,
      targetType,
      targetId,
    );
    const refundedAmount = await this.payments.sumCompletedRefundsForTarget(
      organizationId,
      targetType,
      targetId,
    );
    const netPaid = Money.max(new Money(paidAmount).minus(refundedAmount), Money.zero());
    const balanceDue = Money.max(new Money(totalAmount).minus(netPaid), Money.zero()).toFixed(2);
    return {
      targetType,
      targetId,
      totalAmount: new Money(totalAmount).toFixed(2),
      paidAmount,
      refundedAmount,
      balanceDue,
      status: computePaymentStatusProjection(totalAmount, paidAmount, refundedAmount),
    };
  }

  private async validateAllocationTarget(
    organizationId: string,
    storeId: string,
    paymentType: PaymentType,
    targetType: PaymentAllocationTargetType,
    targetId: string,
  ): Promise<void> {
    if (paymentType === PaymentType.ORDER_PREPAYMENT) {
      if (targetType !== PaymentAllocationTargetType.ORDER) {
        throw new BadRequestException({
          code: 'INVALID_ALLOCATION_TARGET',
          message: 'Order prepayment must allocate to ORDER',
        });
      }
      const order = await this.ordersPayment.getOrderPaymentTarget(
        organizationId,
        storeId,
        targetId,
      );
      if (!order) {
        throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
      }
      try {
        assertOrderAcceptsPrepayment(order.status);
      } catch (error) {
        mapDomain(error);
      }
      this.ordersPayment.assertAcceptsPrepayment(order);
      if (!order.totalAmount) {
        throw new BadRequestException({
          code: 'ORDER_TOTAL_REQUIRED',
          message: 'Order planned price is required before prepayment',
        });
      }
      return;
    }

    if (targetType !== PaymentAllocationTargetType.SALE) {
      throw new BadRequestException({
        code: 'INVALID_ALLOCATION_TARGET',
        message: 'Sale payment must allocate to SALE',
      });
    }
    const sale = await this.salesPayment.getSalePaymentTarget(
      organizationId,
      storeId,
      targetId,
    );
    if (!sale) {
      throw new NotFoundException({ code: 'SALE_NOT_FOUND', message: 'Sale not found' });
    }
    try {
      assertSaleAcceptsPayment(sale.status);
    } catch (error) {
      mapDomain(error);
    }
    this.salesPayment.assertAcceptsPayment(sale);
  }

  private async assertNoOverpaymentForPayment(payment: PaymentView): Promise<void> {
    for (const allocation of payment.allocations.filter((row) => row.isActive)) {
      let total: string | null = null;
      if (allocation.targetType === PaymentAllocationTargetType.ORDER) {
        const order = await this.ordersPayment.getOrderPaymentTarget(
          payment.organizationId,
          payment.storeId,
          allocation.targetId,
        );
        if (!order?.totalAmount) {
          throw new BadRequestException({
            code: 'ORDER_TOTAL_REQUIRED',
            message: 'Order planned price is required before completing payment',
          });
        }
        total = order.totalAmount;
      } else {
        const sale = await this.salesPayment.getSalePaymentTarget(
          payment.organizationId,
          payment.storeId,
          allocation.targetId,
        );
        if (!sale) {
          throw new NotFoundException({ code: 'SALE_NOT_FOUND', message: 'Sale not found' });
        }
        total = sale.netAmount;
      }

      const alreadyPaid = await this.payments.sumActiveCompletedAllocationsForTarget(
        payment.organizationId,
        allocation.targetType,
        allocation.targetId,
      );
      try {
        assertNoOverpayment(total, alreadyPaid, allocation.amount);
      } catch (error) {
        mapDomain(error);
      }
    }
  }

  private async notifyTargets(
    payment: PaymentView,
    status: PaymentStatus,
    occurredAt: Date,
  ): Promise<void> {
    for (const allocation of payment.allocations) {
      if (allocation.targetType === PaymentAllocationTargetType.ORDER) {
        if (status === PaymentStatus.COMPLETED) {
          await this.ordersPayment.appendTimelineEvent({
            organizationId: payment.organizationId,
            orderId: allocation.targetId,
            paymentId: payment.id,
            occurredAt,
          });
        }
      } else {
        await this.salesPayment.appendTimelineEvent({
          organizationId: payment.organizationId,
          saleId: allocation.targetId,
          paymentId: payment.id,
          status,
          occurredAt,
        });
      }
    }
  }

  /** @returns true when the key was already claimed for this document (safe replay). */
  private async claimIdempotency(
    organizationId: string,
    scope: string,
    key: string,
    documentId: string,
  ): Promise<boolean> {
    const previous = await this.payments.findIdempotency(organizationId, scope, key);
    if (previous) {
      if (previous.documentId !== documentId) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'Idempotency key belongs to another document',
        });
      }
      return true;
    }
    await this.payments.createIdempotency({
      id: randomUUID(),
      organizationId,
      scope,
      key,
      documentId,
    });
    return false;
  }

  private async requirePayment(
    organizationId: string,
    storeId: string,
    paymentId: string,
  ): Promise<PaymentView> {
    const payment = await this.payments.getPayment(organizationId, storeId, paymentId);
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
    }
    return payment;
  }

  private async requireRefund(
    organizationId: string,
    storeId: string,
    refundId: string,
  ): Promise<PaymentRefundView> {
    const refund = await this.payments.getRefund(organizationId, storeId, refundId);
    if (!refund) {
      throw new NotFoundException({ code: 'REFUND_NOT_FOUND', message: 'Refund not found' });
    }
    return refund;
  }

  private async appendTimeline(
    payment: PaymentView,
    type: PaymentTimelineEventType,
    message: string | null,
    payload: unknown,
  ): Promise<void> {
    await this.payments.appendTimeline({
      id: randomUUID(),
      organizationId: payment.organizationId,
      paymentId: payment.id,
      type,
      message,
      actorMembershipId: actorMembershipId(),
      payload,
      occurredAt: this.clock.now(),
    });
  }

  private async auditPayment(
    payment: PaymentView,
    action: string,
    before: unknown,
    after: unknown,
    reason?: string,
  ): Promise<void> {
    await this.audit.append({
      organizationId: payment.organizationId,
      storeId: payment.storeId,
      actorId: getRequestContext()?.actorId ?? null,
      action,
      entityType: 'Payment',
      entityId: payment.id,
      beforeState: (before as Record<string, unknown> | null) ?? null,
      afterState: (after as Record<string, unknown> | null) ?? null,
      reason: reason ?? null,
      requestId: getRequestContext()?.requestId ?? 'unknown',
      occurredAt: this.clock.now(),
    });
  }
}
