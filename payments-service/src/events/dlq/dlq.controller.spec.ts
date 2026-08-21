import { HttpException, HttpStatus } from '@nestjs/common';
import { DlqController } from './dlq.controller';
import { DlqService } from './dlq.service';

describe('DlqController', () => {
  let dlqService: {
    getStats: jest.Mock;
    peekMessages: jest.Mock;
    reprocessMessage: jest.Mock;
    reprocessAll: jest.Mock;
    discardMessage: jest.Mock;
    purgeAll: jest.Mock;
  };
  let controller: DlqController;

  beforeEach(() => {
    dlqService = {
      getStats: jest.fn(),
      peekMessages: jest.fn(),
      reprocessMessage: jest.fn(),
      reprocessAll: jest.fn(),
      discardMessage: jest.fn(),
      purgeAll: jest.fn(),
    };
    controller = new DlqController(dlqService as unknown as DlqService);
  });

  async function expectHttpException(
    promise: Promise<unknown>,
    status: HttpStatus,
  ) {
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    try {
      await promise;
      throw new Error('expected promise to reject');
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(status);
    }
  }

  describe('getStats', () => {
    it('returns the DLQ stats from the service', async () => {
      dlqService.getStats.mockResolvedValue({
        queueName: 'payment_queue.dlq',
        messageCount: 2,
        consumerCount: 0,
      });

      const result = await controller.getStats();

      expect(result).toEqual({
        queueName: 'payment_queue.dlq',
        messageCount: 2,
        consumerCount: 0,
      });
    });

    it('wraps a service failure in a 500 HttpException', async () => {
      dlqService.getStats.mockRejectedValue(
        new Error('RabbitMQ channel not available'),
      );

      await expectHttpException(
        controller.getStats(),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    });
  });

  describe('getMessages', () => {
    it('returns count and messages, defaulting the limit to 10', async () => {
      dlqService.peekMessages.mockResolvedValue([
        { content: {}, properties: {} },
      ]);

      const result = await controller.getMessages(undefined);

      expect(dlqService.peekMessages).toHaveBeenCalledWith(10);
      expect(result.count).toBe(1);
      expect(result.messages).toHaveLength(1);
    });

    it('parses the limit query param', async () => {
      dlqService.peekMessages.mockResolvedValue([]);

      await controller.getMessages('5');

      expect(dlqService.peekMessages).toHaveBeenCalledWith(5);
    });
  });

  describe('reprocessMessage', () => {
    it('returns success when the message is found', async () => {
      dlqService.reprocessMessage.mockResolvedValue(true);

      const result = await controller.reprocessMessage('order-1');

      expect(result.success).toBe(true);
    });

    it('throws a 404 HttpException when the message is not found', async () => {
      dlqService.reprocessMessage.mockResolvedValue(false);

      await expectHttpException(
        controller.reprocessMessage('missing'),
        HttpStatus.NOT_FOUND,
      );
    });
  });

  describe('reprocessAll', () => {
    it('returns success with the processed/failed counts', async () => {
      dlqService.reprocessAll.mockResolvedValue({ processed: 3, failed: 1 });

      const result = await controller.reprocessAll();

      expect(result).toEqual({ success: true, processed: 3, failed: 1 });
    });
  });

  describe('discardMessage', () => {
    it('returns success when the message is found', async () => {
      dlqService.discardMessage.mockResolvedValue(true);

      const result = await controller.discardMessage('order-1');

      expect(result.success).toBe(true);
    });

    it('throws a 404 HttpException when the message is not found', async () => {
      dlqService.discardMessage.mockResolvedValue(false);

      await expectHttpException(
        controller.discardMessage('missing'),
        HttpStatus.NOT_FOUND,
      );
    });
  });
});
