import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { FakePaymentGatewayService } from './fake-payment-gateway.service';
import { PaymentOrderMessage } from '../events/payment-queue.interface';
import { MetricsService } from '../metrics/metrics.service';

export interface PaymentResponse {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  status: PaymentStatus;
  paymentMethod: string;
  transactionId: string | null;
  rejectionReason: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    private readonly fakePaymentGatewayService: FakePaymentGatewayService,
    private readonly metricsService: MetricsService,
  ) {}

  async processPayment(message: PaymentOrderMessage): Promise<void> {
    const existing = await this.paymentsRepository.findOne({
      where: { orderId: message.orderId },
    });

    if (existing && existing.status !== 'pending') {
      return;
    }

    const payment =
      existing ??
      (await this.paymentsRepository.save(
        this.paymentsRepository.create({
          orderId: message.orderId,
          userId: message.userId,
          amount: message.amount,
          paymentMethod: message.paymentMethod,
          status: 'pending',
        }),
      ));

    const result = await this.fakePaymentGatewayService.process(message.amount);

    payment.status = result.approved ? 'approved' : 'rejected';
    payment.transactionId = result.transactionId ?? null;
    payment.rejectionReason = result.rejectionReason ?? null;
    payment.processedAt = new Date();

    await this.paymentsRepository.save(payment);

    if (result.approved) {
      this.metricsService.incrementPaymentsApproved();
    } else {
      this.metricsService.incrementPaymentsRejected(
        result.rejectionReason ?? 'unknown',
      );
    }
    this.metricsService.incrementPaymentsProcessed();
  }

  async findByOrderId(orderId: string): Promise<PaymentResponse> {
    const payment = await this.paymentsRepository.findOne({
      where: { orderId },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    return this.toResponse(payment);
  }

  private toResponse(payment: Payment): PaymentResponse {
    return {
      id: payment.id,
      orderId: payment.orderId,
      userId: payment.userId,
      amount: Number(payment.amount),
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      transactionId: payment.transactionId,
      rejectionReason: payment.rejectionReason,
      processedAt: payment.processedAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
