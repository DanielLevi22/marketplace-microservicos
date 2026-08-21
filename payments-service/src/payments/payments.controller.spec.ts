import { NotFoundException } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentResponse, PaymentsService } from './payments.service';

describe('PaymentsController', () => {
  let paymentsService: { findByOrderId: jest.Mock };
  let controller: PaymentsController;

  beforeEach(() => {
    paymentsService = { findByOrderId: jest.fn() };
    controller = new PaymentsController(
      paymentsService as unknown as PaymentsService,
    );
  });

  describe('findByOrderId', () => {
    it('returns the payment data for an existing orderId', async () => {
      const payment: PaymentResponse = {
        id: 'payment-1',
        orderId: 'order-1',
        userId: 'user-1',
        amount: 150.5,
        status: 'approved',
        paymentMethod: 'pix',
        transactionId: 'txn-1',
        rejectionReason: null,
        processedAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };
      paymentsService.findByOrderId.mockResolvedValue(payment);

      const result = await controller.findByOrderId('order-1');

      expect(paymentsService.findByOrderId).toHaveBeenCalledWith('order-1');
      expect(result).toEqual(payment);
    });

    it('propagates the 404 raised by the service when the payment does not exist', async () => {
      paymentsService.findByOrderId.mockRejectedValue(
        new NotFoundException('Pagamento não encontrado'),
      );

      await expect(
        controller.findByOrderId('missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(paymentsService.findByOrderId).toHaveBeenCalledWith('missing');
    });
  });
});
