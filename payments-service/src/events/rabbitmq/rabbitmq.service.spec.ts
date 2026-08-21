import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { RabbitmqService } from './rabbitmq.service';

jest.mock('amqplib');

describe('RabbitmqService', () => {
  let configService: { get: jest.Mock };
  let channel: {
    close: jest.Mock;
    assertExchange: jest.Mock;
    publish: jest.Mock;
  };
  let connection: {
    createChannel: jest.Mock;
    close: jest.Mock;
    on: jest.Mock;
  };
  let service: RabbitmqService;

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn().mockReturnValue('amqp://admin:admin@localhost:5672'),
    };
    channel = {
      close: jest.fn().mockResolvedValue(undefined),
      assertExchange: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockReturnValue(true),
    };
    connection = {
      createChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    service = new RabbitmqService(configService as unknown as ConfigService);
  });

  describe('onModuleInit', () => {
    it('connects to RabbitMQ and creates a channel', async () => {
      await service.onModuleInit();

      expect(amqp.connect).toHaveBeenCalledWith(
        'amqp://admin:admin@localhost:5672',
      );
      expect(connection.createChannel).toHaveBeenCalledTimes(1);
      expect(service.getChannel()).toBe(channel);
      expect(service.getConnection()).toBe(connection);
    });

    it('does not throw when the connection fails, it just stays disconnected', async () => {
      (amqp.connect as jest.Mock).mockRejectedValue(
        new Error('connection refused'),
      );

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(service.getChannel()).toBeUndefined();
    });
  });

  describe('onModuleDestroy', () => {
    it('closes the channel and the connection when connected', async () => {
      await service.onModuleInit();

      await service.onModuleDestroy();

      expect(channel.close).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('does not throw when there is nothing to close', async () => {
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });

  describe('waitForConnection', () => {
    it('resolves true immediately once the channel is set', async () => {
      await service.onModuleInit();

      await expect(service.waitForConnection(3, 1)).resolves.toBe(true);
    });

    it('resolves false after exhausting the attempts when there is no channel', async () => {
      await expect(service.waitForConnection(2, 1)).resolves.toBe(false);
    });
  });

  describe('publishMessage', () => {
    it('skips publishing when there is no channel available', async () => {
      await service.publishMessage('payments', 'payment.order', {
        orderId: 'order-1',
      });

      expect(channel.assertExchange).not.toHaveBeenCalled();
      expect(channel.publish).not.toHaveBeenCalled();
    });

    it('asserts the exchange and publishes the message when the channel is available', async () => {
      await service.onModuleInit();

      await service.publishMessage('payments', 'payment.order', {
        orderId: 'order-1',
      });

      expect(channel.assertExchange).toHaveBeenCalledWith(
        'payments',
        'topic',
        { durable: true },
      );
      expect(channel.publish).toHaveBeenCalledWith(
        'payments',
        'payment.order',
        expect.any(Buffer),
        expect.objectContaining({ persistent: true }),
      );
    });

    it('does not throw when the channel reports the publish failed', async () => {
      await service.onModuleInit();
      channel.publish.mockReturnValue(false);

      await expect(
        service.publishMessage('payments', 'payment.order', {}),
      ).resolves.toBeUndefined();
    });
  });
});
