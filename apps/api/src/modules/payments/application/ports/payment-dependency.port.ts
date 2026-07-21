export const PAYMENT_DEPENDENCY_PORT = Symbol('PAYMENT_DEPENDENCY_PORT');

export interface PaymentDependencyPort {
  assertNoBlockingDependencies(paymentId: string): Promise<void>;
}

export class NoopPaymentDependencyAdapter implements PaymentDependencyPort {
  async assertNoBlockingDependencies(): Promise<void> {}
}
