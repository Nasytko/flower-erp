import { Inject, Injectable } from '@nestjs/common';
import { PaymentUseCases } from '../application/payment.use-cases';
import type {
  DeliveryPaymentSummary,
  PaymentsDeliveryReadPort,
} from '../application/ports/payments-delivery-read.port';

@Injectable()
export class PrismaPaymentsDeliveryReadAdapter implements PaymentsDeliveryReadPort {
  constructor(@Inject(PaymentUseCases) private readonly payments: PaymentUseCases) {}

  async getOrderPaymentSummary(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<DeliveryPaymentSummary | null> {
    try {
      const summary = await this.payments.getOrderPaymentSummary(
        organizationId,
        storeId,
        orderId,
      );
      return {
        orderTotal: summary.totalAmount,
        paidAmount: summary.paidAmount,
        refundedAmount: summary.refundedAmount,
        balanceDue: summary.balanceDue,
        paymentStatus: summary.status,
      };
    } catch {
      return null;
    }
  }
}
