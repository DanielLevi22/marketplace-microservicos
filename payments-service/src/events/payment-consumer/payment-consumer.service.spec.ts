import { PaymentConsumerService } from './payment-consumer.service';
import { PaymentQueueService } from '../payment-queue/payment-queue.service';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { PaymentsService } from '../../payments/payments.service';
import { PaymentOrderMessage } from '../payment-queue.interface';

describe('PaymentConsumerService', () => {
  let paymentQueueService: { consumePaymentOrders: jest.Mock };
  let rabbitMQService: { waitForConnection: jest.Mock };
  let paymentsService: { processPayment: jest.Mock };
  let service: PaymentConsumerService;

  const validMessage: PaymentOrderMessage = {
    orderId: 'order-1',
    userId: 'user-1',
    amount: 150.5,
    items: [{ productId: 'product-1', quantity: 1, price: 150.5 }],
    paymentMethod: 'pix',
  };

  beforeEach(() => {
    paymentQueueService = { consumePaymentOrders: jest.fn() };
    rabbitMQService = { waitForConnection: jest.fn() };
    paymentsService = { processPayment: jest.fn() };

    service = new PaymentConsumerService(
      paymentQueueService as unknown as PaymentQueueService,
      rabbitMQService as unknown as RabbitmqService,
      paymentsService as unknown as PaymentsService,
    );
  });

  function callProcessPaymentOrder(
    message: PaymentOrderMessage,
  ): Promise<void> {
    const privateService = service as unknown as {
      processPaymentOrder: (m: PaymentOrderMessage) => Promise<void>;
    };
    return privateService.processPaymentOrder(message);
  }

  it('calls PaymentsService.processPayment with the received message', async () => {
    paymentsService.processPayment.mockResolvedValue(undefined);

    await callProcessPaymentOrder(validMessage);

    expect(paymentsService.processPayment).toHaveBeenCalledWith(validMessage);
    expect(service.getMetrics().totalSuccess).toBe(1);
    expect(service.getMetrics().totalFailed).toBe(0);
  });

  it('does not call processPayment and rethrows when the message is invalid', async () => {
    const invalidMessage = { ...validMessage, orderId: '' };

    await expect(callProcessPaymentOrder(invalidMessage)).rejects.toThrow(
      'Invalid payment message received',
    );

    expect(paymentsService.processPayment).not.toHaveBeenCalled();
    expect(service.getMetrics().totalFailed).toBe(1);
  });

  it('propagates a failure from processPayment (retry/DLQ path)', async () => {
    paymentsService.processPayment.mockRejectedValue(
      new Error('DB unavailable'),
    );

    await expect(callProcessPaymentOrder(validMessage)).rejects.toThrow(
      'DB unavailable',
    );

    expect(service.getMetrics().totalFailed).toBe(1);
    expect(service.getMetrics().totalSuccess).toBe(0);
  });

  it('treats a resolved processPayment as success even when the payment was rejected by the gateway', async () => {
    // processPayment resolve normalmente também quando o pagamento é rejeitado
    // pelo gateway (é um desfecho de negócio, não um erro de processamento).
    paymentsService.processPayment.mockResolvedValue(undefined);

    await callProcessPaymentOrder(validMessage);

    expect(service.getMetrics().totalSuccess).toBe(1);
    expect(service.getMetrics().totalFailed).toBe(0);
  });
});
