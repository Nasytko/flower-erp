/** Contract only. Fiscalization is not coupled to payment posting. */
export const FISCALIZATION_PORT = Symbol('FISCALIZATION_PORT');
export interface FiscalizationPort {
  fiscalizePayment(input: { paymentId: string; amount: string; currencyCode: 'BYN' }): Promise<void>;
}
