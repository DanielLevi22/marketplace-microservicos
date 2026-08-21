import { DlqService } from './dlq.service';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { PaymentOrderMessage } from '../payment-queue.interface';

describe('DlqService', () => {
  let channel: {
    checkQueue: jest.Mock;
    get: jest.Mock;
    ack: jest.Mock;
    nack: jest.Mock;
    purgeQueue: jest.Mock;
  };
  let rabbitmqService: { getChannel: jest.Mock; publishMessage: jest.Mock };
  let service: DlqService;

  const message: PaymentOrderMessage = {
    orderId: 'order-1',
    userId: 'user-1',
    amount: 150.5,
    items: [{ productId: 'product-1', quantity: 1, price: 150.5 }],
    paymentMethod: 'pix',
  };

  function dlqMessage(content: PaymentOrderMessage) {
    return {
      content: Buffer.from(JSON.stringify(content)),
      properties: { messageId: 'msg-1', timestamp: Date.now(), headers: {} },
    };
  }

  beforeEach(() => {
    channel = {
      checkQueue: jest.fn(),
      get: jest.fn(),
      ack: jest.fn(),
      nack: jest.fn(),
      purgeQueue: jest.fn(),
    };
    rabbitmqService = {
      getChannel: jest.fn().mockReturnValue(channel),
      publishMessage: jest.fn().mockResolvedValue(undefined),
    };
    service = new DlqService(rabbitmqService as unknown as RabbitmqService);
  });

  describe('getStats', () => {
    it('returns the DLQ name, message count and consumer count', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 3,
        consumerCount: 1,
      });

      const stats = await service.getStats();

      expect(channel.checkQueue).toHaveBeenCalledWith('payment_queue.dlq');
      expect(stats).toEqual({
        queueName: 'payment_queue.dlq',
        messageCount: 3,
        consumerCount: 1,
      });
    });

    it('throws when the RabbitMQ channel is not available', async () => {
      rabbitmqService.getChannel.mockReturnValue(undefined);

      await expect(service.getStats()).rejects.toThrow(
        'RabbitMQ channel not available',
      );
    });
  });

  describe('peekMessages', () => {
    it('parses messages and nacks them back to the queue (peek only)', async () => {
      channel.get
        .mockResolvedValueOnce(dlqMessage(message))
        .mockResolvedValueOnce(false);

      const messages = await service.peekMessages(5);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toEqual(message);
      expect(messages[0].properties.messageId).toBe('msg-1');
      expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, true);
      expect(channel.ack).not.toHaveBeenCalled();
    });

    it('stops as soon as there are no more messages in the queue', async () => {
      channel.get.mockResolvedValue(false);

      const messages = await service.peekMessages(10);

      expect(messages).toEqual([]);
      expect(channel.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('reprocessMessage', () => {
    it('republishes the matching message to the main queue and acks it', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 1,
        consumerCount: 0,
      });
      channel.get.mockResolvedValueOnce(dlqMessage(message));

      const found = await service.reprocessMessage('order-1');

      expect(found).toBe(true);
      expect(rabbitmqService.publishMessage).toHaveBeenCalledWith(
        'payments',
        'payment.order',
        message,
      );
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('returns false and puts non-matching messages back in the DLQ', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 1,
        consumerCount: 0,
      });
      channel.get.mockResolvedValueOnce(
        dlqMessage({ ...message, orderId: 'other-order' }),
      );

      const found = await service.reprocessMessage('order-1');

      expect(found).toBe(false);
      expect(rabbitmqService.publishMessage).not.toHaveBeenCalled();
      expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, true);
    });
  });

  describe('reprocessAll', () => {
    it('republishes every message currently in the DLQ and acks each one', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 2,
        consumerCount: 0,
      });
      channel.get
        .mockResolvedValueOnce(dlqMessage(message))
        .mockResolvedValueOnce(
          dlqMessage({ ...message, orderId: 'order-2' }),
        );

      const result = await service.reprocessAll();

      expect(result).toEqual({ processed: 2, failed: 0 });
      expect(rabbitmqService.publishMessage).toHaveBeenCalledTimes(2);
      expect(channel.ack).toHaveBeenCalledTimes(2);
    });

    it('counts a message as failed and keeps it in the DLQ when parsing fails', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 1,
        consumerCount: 0,
      });
      channel.get.mockResolvedValueOnce({
        content: Buffer.from('not-json'),
        properties: {},
      });

      const result = await service.reprocessAll();

      expect(result).toEqual({ processed: 0, failed: 1 });
      expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, true);
    });
  });

  describe('discardMessage', () => {
    it('permanently removes the matching message (ack without republishing)', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 1,
        consumerCount: 0,
      });
      channel.get.mockResolvedValueOnce(dlqMessage(message));

      const found = await service.discardMessage('order-1');

      expect(found).toBe(true);
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(rabbitmqService.publishMessage).not.toHaveBeenCalled();
    });

    it('returns false and does not ack when the message is not found', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 1,
        consumerCount: 0,
      });
      channel.get.mockResolvedValueOnce(
        dlqMessage({ ...message, orderId: 'other-order' }),
      );

      const found = await service.discardMessage('order-1');

      expect(found).toBe(false);
      expect(channel.ack).not.toHaveBeenCalled();
    });
  });
});
