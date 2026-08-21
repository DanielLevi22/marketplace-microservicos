import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export interface PaymentGatewayResult {
  approved: boolean;
  transactionId?: string;
  rejectionReason?: string;
}

const MIN_LATENCY_MS = 500;
const MAX_LATENCY_MS = 2000;
const AMOUNT_LIMIT = 10000;

@Injectable()
export class FakePaymentGatewayService {
  async process(amount: number): Promise<PaymentGatewayResult> {
    await this.simulateLatency();

    if (amount > AMOUNT_LIMIT) {
      return { approved: false, rejectionReason: 'Limite excedido' };
    }

    if (this.endsInNinetyNineCents(amount)) {
      return {
        approved: false,
        rejectionReason: 'Cartão recusado pela operadora',
      };
    }

    return { approved: true, transactionId: randomUUID() };
  }

  private simulateLatency(): Promise<void> {
    const delayMs =
      MIN_LATENCY_MS + Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS);

    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private endsInNinetyNineCents(amount: number): boolean {
    return Math.round(amount * 100) % 100 === 99;
  }
}
