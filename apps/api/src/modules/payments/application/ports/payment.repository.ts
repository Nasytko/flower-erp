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
  PaymentTimelineEventType,
  PaymentType,
} from '../../domain/payment-rules';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export type PaymentMethodView = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: PaymentMethodType;
  isActive: boolean;
  requiresExternalConfirmation: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentAllocationView = {
  id: string;
  organizationId: string;
  paymentId: string;
  targetType: PaymentAllocationTargetType;
  targetId: string;
  amount: string;
  isActive: boolean;
  supersededAt: Date | null;
  createdAt: Date;
};

export type PaymentView = {
  id: string;
  organizationId: string;
  storeId: string;
  number: string;
  type: PaymentType;
  status: PaymentStatus;
  direction: PaymentDirection;
  methodId: string;
  amount: string;
  currencyCode: string;
  receivedAt: Date;
  comment: string | null;
  externalReference: string | null;
  createdByMembershipId: string | null;
  completedAt: Date | null;
  annulledAt: Date | null;
  annulReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  allocations: PaymentAllocationView[];
};

export type PaymentRefundView = {
  id: string;
  organizationId: string;
  storeId: string;
  originalPaymentId: string;
  amount: string;
  reason: string;
  status: PaymentRefundStatus;
  methodId: string;
  externalReference: string | null;
  createdByMembershipId: string | null;
  completedAt: Date | null;
  annulledAt: Date | null;
  annulReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentTimelineEventView = {
  id: string;
  organizationId: string;
  paymentId: string;
  type: PaymentTimelineEventType | string;
  message: string | null;
  actorMembershipId: string | null;
  payload: unknown;
  occurredAt: Date;
  createdAt: Date;
};

export type CashAccountView = {
  id: string;
  organizationId: string;
  storeId: string;
  name: string;
  type: CashAccountType;
  status: CashAccountStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CashOperationView = {
  id: string;
  organizationId: string;
  storeId: string;
  cashAccountId: string;
  paymentId: string | null;
  refundId: string | null;
  type: CashOperationType;
  direction: CashOperationDirection;
  amount: string;
  occurredAt: Date;
  comment: string | null;
  createdByMembershipId: string | null;
  createdAt: Date;
};

export type AllocationTransferView = {
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
  createdAt: Date;
};

export type CreatePaymentAllocationInput = {
  id: string;
  targetType: PaymentAllocationTargetType;
  targetId: string;
  amount: string;
};

export type CreatePaymentInput = {
  id: string;
  organizationId: string;
  storeId: string;
  number: string;
  type: PaymentType;
  direction: PaymentDirection;
  methodId: string;
  amount: string;
  currencyCode: string;
  receivedAt: Date;
  comment: string | null;
  externalReference: string | null;
  createdByMembershipId: string | null;
  allocations: CreatePaymentAllocationInput[];
};

export type CreateRefundInput = {
  id: string;
  organizationId: string;
  storeId: string;
  originalPaymentId: string;
  amount: string;
  reason: string;
  methodId: string;
  externalReference: string | null;
  createdByMembershipId: string | null;
};

export type CreateCashOperationInput = {
  id: string;
  organizationId: string;
  storeId: string;
  cashAccountId: string;
  paymentId: string | null;
  refundId: string | null;
  type: CashOperationType;
  direction: CashOperationDirection;
  amount: string;
  occurredAt: Date;
  comment: string | null;
  createdByMembershipId: string | null;
};

export type IdempotencyRecord = {
  id: string;
  organizationId: string;
  scope: string;
  key: string;
  documentId: string;
};

export interface PaymentRepository {
  listPaymentMethods(organizationId: string, activeOnly?: boolean): Promise<PaymentMethodView[]>;
  getPaymentMethod(organizationId: string, methodId: string): Promise<PaymentMethodView | null>;
  findPaymentMethodByCode(organizationId: string, code: string): Promise<PaymentMethodView | null>;
  createPaymentMethod(input: {
    id: string;
    organizationId: string;
    code: string;
    name: string;
    type: PaymentMethodType;
    requiresExternalConfirmation?: boolean;
    sortOrder?: number;
  }): Promise<PaymentMethodView>;
  archivePaymentMethod(organizationId: string, methodId: string): Promise<PaymentMethodView>;

  nextPaymentNumber(organizationId: string): Promise<string>;
  createPayment(input: CreatePaymentInput): Promise<PaymentView>;
  getPayment(organizationId: string, storeId: string, paymentId: string): Promise<PaymentView | null>;
  listPayments(
    organizationId: string,
    storeId: string,
    filter?: { status?: PaymentStatus; type?: PaymentType },
  ): Promise<PaymentView[]>;
  markPaymentCompleted(input: {
    organizationId: string;
    storeId: string;
    paymentId: string;
    completedAt: Date;
  }): Promise<PaymentView>;
  markPaymentAnnulled(input: {
    organizationId: string;
    storeId: string;
    paymentId: string;
    annulledAt: Date;
    annulReason: string;
  }): Promise<PaymentView>;
  deactivateAllocationsForPayment(
    organizationId: string,
    paymentId: string,
    supersededAt: Date,
  ): Promise<void>;

  listActiveOrderAllocations(
    organizationId: string,
    orderId: string,
  ): Promise<PaymentAllocationView[]>;
  supersedeAllocation(
    organizationId: string,
    allocationId: string,
    supersededAt: Date,
  ): Promise<PaymentAllocationView>;
  createAllocation(input: {
    id: string;
    organizationId: string;
    paymentId: string;
    targetType: PaymentAllocationTargetType;
    targetId: string;
    amount: string;
  }): Promise<PaymentAllocationView>;
  createAllocationTransfer(input: {
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
  }): Promise<AllocationTransferView>;

  createRefund(input: CreateRefundInput): Promise<PaymentRefundView>;
  getRefund(organizationId: string, storeId: string, refundId: string): Promise<PaymentRefundView | null>;
  listRefundsForPayment(
    organizationId: string,
    storeId: string,
    paymentId: string,
  ): Promise<PaymentRefundView[]>;
  markRefundCompleted(input: {
    organizationId: string;
    storeId: string;
    refundId: string;
    completedAt: Date;
  }): Promise<PaymentRefundView>;
  markRefundAnnulled(input: {
    organizationId: string;
    storeId: string;
    refundId: string;
    annulledAt: Date;
    annulReason: string;
  }): Promise<PaymentRefundView>;

  appendTimeline(input: {
    id: string;
    organizationId: string;
    paymentId: string;
    type: PaymentTimelineEventType | string;
    message: string | null;
    actorMembershipId: string | null;
    payload: unknown;
    occurredAt: Date;
  }): Promise<PaymentTimelineEventView>;
  listTimeline(
    organizationId: string,
    paymentId: string,
  ): Promise<PaymentTimelineEventView[]>;

  ensureDefaultCashAccount(input: {
    id: string;
    organizationId: string;
    storeId: string;
    name: string;
    type: CashAccountType;
  }): Promise<CashAccountView>;
  listCashAccounts(organizationId: string, storeId: string): Promise<CashAccountView[]>;
  getActiveCashRegister(
    organizationId: string,
    storeId: string,
  ): Promise<CashAccountView | null>;
  createCashOperation(input: CreateCashOperationInput): Promise<CashOperationView>;
  listCashOperations(
    organizationId: string,
    storeId: string,
    cashAccountId?: string,
  ): Promise<CashOperationView[]>;

  sumActiveCompletedAllocationsForTarget(
    organizationId: string,
    targetType: PaymentAllocationTargetType,
    targetId: string,
  ): Promise<string>;
  sumCompletedRefundsForPayment(organizationId: string, paymentId: string): Promise<string>;
  sumCompletedRefundsForTarget(
    organizationId: string,
    targetType: PaymentAllocationTargetType,
    targetId: string,
  ): Promise<string>;
  countCompletedRefunds(organizationId: string, paymentId: string): Promise<number>;

  findIdempotency(
    organizationId: string,
    scope: string,
    key: string,
  ): Promise<IdempotencyRecord | null>;
  createIdempotency(input: {
    id: string;
    organizationId: string;
    scope: string;
    key: string;
    documentId: string;
  }): Promise<IdempotencyRecord>;
}
