/** Contract only. Terminal integration is intentionally outside Epic 09. */
export const PAYMENT_TERMINAL_PORT = Symbol('PAYMENT_TERMINAL_PORT');
export interface PaymentTerminalPort {
  requestPayment(input: { paymentId: string; amount: string; currencyCode: 'BYN' }): Promise<{ reference: string }>;
}
