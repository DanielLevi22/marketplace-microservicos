import { ConfigService } from '@nestjs/config';
import { RabbitmqService } from './rabbitmq.service';
import { MetricsService } from '../../metrics/metrics.service';

describe('RabbitmqService', () => {
  let configService: { get: jest.Mock };
  let metricsService: { incrementRabbitMessagesPublished: jest.Mock };
  let channel: { assertExchange: jest.Mock; publish: jest.Mock };
  let service: RabbitmqService;

  beforeEach(() => {
    configService = { get: jest.fn() };
    metricsService = { incrementRabbitMessagesPublished: jest.fn() };
    channel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockReturnValue(true),
    };

    service = new RabbitmqService(
      configService as unknown as ConfigService,
      metricsService as unknown as MetricsService,
    );
    (service as unknown as { channel: unknown }).channel = channel;
  });

  describe('publishMessage', () => {
    it('increments rabbitmq_messages_published_total with the routing key when publish succeeds', async () => {
      channel.publish.mockReturnValue(true);

      await service.publishMessage('payments', 'payment.order', { foo: 1 });

      expect(
        metricsService.incrementRabbitMessagesPublished,
      ).toHaveBeenCalledWith('payment.order');
    });

    it('does not increment the metric when publish fails', async () => {
      channel.publish.mockReturnValue(false);

      await service.publishMessage('payments', 'payment.order', { foo: 1 });

      expect(
        metricsService.incrementRabbitMessagesPublished,
      ).not.toHaveBeenCalled();
    });

    it('does not increment the metric when the channel is not available', async () => {
      (service as unknown as { channel: unknown }).channel = undefined;

      await service.publishMessage('payments', 'payment.order', { foo: 1 });

      expect(
        metricsService.incrementRabbitMessagesPublished,
      ).not.toHaveBeenCalled();
    });
  });
});
