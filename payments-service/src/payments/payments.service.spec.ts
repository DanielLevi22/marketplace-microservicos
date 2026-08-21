import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PaymentsService } from './payments.service';
import { Payment } from './entities/payment.entity';
import { FakePaymentGatewayService } from './fake-payment-gateway.service';
import { PaymentOrderMessage } from '../events/payment-queue.interface';
import { MetricsService } from '../metrics/metrics.service';

describe('PaymentsService', () => {
  let paymentsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let fakePaymentGatewayService: { process: jest.Mock };
  let metricsService: {
    incrementPaymentsProcessed: jest.Mock;
    incrementPaymentsApproved: jest.Mock;
    incrementPaymentsRejected: jest.Mock;
  };
  let service: PaymentsService;

  const message: PaymentOrderMessage = {
    orderId: 'order-1',
    userId: 'user-1',
    amount: 150.5,
    items: [{ productId: 'product-1', quantity: 1, price: 150.5 }],
    paymentMethod: 'pix',
  };

  beforeEach(() => {
    paymentsRepository = {
      create: jest.fn((data: Partial<Payment>) => data),
      save: jest.fn((data: Partial<Payment>) => ({
        id: 'payment-1',
        transactionId: null,
        rejectionReason: null,
        processedAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        ...data,
      })),
      findOne: jest.fn(),
    };
    fakePaymentGatewayService = { process: jest.fn() };
    metricsService = {
      incrementPaymentsProcessed: jest.fn(),
      incrementPaymentsApproved: jest.fn(),
      incrementPaymentsRejected: jest.fn(),
    };

    service = new PaymentsService(
      paymentsRepository as unknown as Repository<Payment>,
      fakePaymentGatewayService as unknown as FakePaymentGatewayService,
      metricsService as unknown as MetricsService,
    );
  });

  describe('processPayment', () => {
    it('creates a pending payment and updates it to approved', async () => {
      paymentsRepository.findOne.mockResolvedValue(null);
      fakePaymentGatewayService.process.mockResolvedValue({
        approved: true,
        transactionId: 'txn-1',
      });

      await service.processPayment(message);

      expect(paymentsRepository.save).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          orderId: 'order-1',
          userId: 'user-1',
          amount: 150.5,
          paymentMethod: 'pix',
          status: 'pending',
        }),
      );
      expect(fakePaymentGatewayService.process).toHaveBeenCalledWith(150.5);
      expect(paymentsRepository.save).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          status: 'approved',
          transactionId: 'txn-1',
          rejectionReason: null,
        }),
      );
      expect(metricsService.incrementPaymentsApproved).toHaveBeenCalledTimes(
        1,
      );
      expect(metricsService.incrementPaymentsRejected).not.toHaveBeenCalled();
      expect(metricsService.incrementPaymentsProcessed).toHaveBeenCalledTimes(
        1,
      );
    });

    it('creates a pending payment and updates it to rejected', async () => {
      paymentsRepository.findOne.mockResolvedValue(null);
      fakePaymentGatewayService.process.mockResolvedValue({
        approved: false,
        rejectionReason: 'Limite excedido',
      });

      await service.processPayment(message);

      expect(paymentsRepository.save).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          status: 'rejected',
          transactionId: null,
          rejectionReason: 'Limite excedido',
        }),
      );
      expect(metricsService.incrementPaymentsRejected).toHaveBeenCalledWith(
        'Limite excedido',
      );
      expect(metricsService.incrementPaymentsApproved).not.toHaveBeenCalled();
      expect(metricsService.incrementPaymentsProcessed).toHaveBeenCalledTimes(
        1,
      );
    });

    it('reuses an existing pending payment instead of creating a new one', async () => {
      const pending: Partial<Payment> = {
        id: 'payment-1',
        orderId: 'order-1',
        userId: 'user-1',
        amount: 150.5,
        paymentMethod: 'pix',
        status: 'pending',
        transactionId: null,
        rejectionReason: null,
        processedAt: null,
      };
      paymentsRepository.findOne.mockResolvedValue(pending);
      fakePaymentGatewayService.process.mockResolvedValue({
        approved: true,
        transactionId: 'txn-1',
      });

      await service.processPayment(message);

      expect(paymentsRepository.create).not.toHaveBeenCalled();
      expect(paymentsRepository.save).toHaveBeenCalledTimes(1);
      expect(paymentsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'payment-1', status: 'approved' }),
      );
      expect(metricsService.incrementPaymentsProcessed).toHaveBeenCalledTimes(
        1,
      );
    });

    it('does not reprocess a payment that is already approved or rejected', async () => {
      paymentsRepository.findOne.mockResolvedValue({
        id: 'payment-1',
        orderId: 'order-1',
        status: 'approved',
      });

      await service.processPayment(message);

      expect(fakePaymentGatewayService.process).not.toHaveBeenCalled();
      expect(paymentsRepository.save).not.toHaveBeenCalled();
      expect(metricsService.incrementPaymentsProcessed).not.toHaveBeenCalled();
      expect(metricsService.incrementPaymentsApproved).not.toHaveBeenCalled();
      expect(metricsService.incrementPaymentsRejected).not.toHaveBeenCalled();
    });
  });

  describe('findByOrderId', () => {
    it('throws NotFoundException when the payment does not exist', async () => {
      paymentsRepository.findOne.mockResolvedValue(null);

      await expect(service.findByOrderId('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(paymentsRepository.findOne).toHaveBeenCalledWith({
        where: { orderId: 'missing' },
      });
    });

    it('returns the payment data with amount converted to number', async () => {
      paymentsRepository.findOne.mockResolvedValue({
        id: 'payment-1',
        orderId: 'order-1',
        userId: 'user-1',
        amount: '150.50',
        status: 'approved',
        paymentMethod: 'pix',
        transactionId: 'txn-1',
        rejectionReason: null,
        processedAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      });

      const result = await service.findByOrderId('order-1');

      expect(result.amount).toBe(150.5);
      expect(typeof result.amount).toBe('number');
      expect(result.status).toBe('approved');
    });
  });
});
