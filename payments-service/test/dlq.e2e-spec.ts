import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RabbitmqService } from '../src/events/rabbitmq/rabbitmq.service';
import { typeormTestConfig } from './utils/typeorm-test.config';
import {
  createChannelMock,
  createRabbitmqServiceMock,
} from './utils/rabbitmq-mock';

describe('DLQ (e2e)', () => {
  let app: INestApplication<App>;
  let channel: ReturnType<typeof createChannelMock>;

  beforeEach(async () => {
    channel = createChannelMock();
    const rabbitmqServiceMock = createRabbitmqServiceMock();
    rabbitmqServiceMock.getChannel.mockReturnValue(channel);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DataSource)
      .useFactory({
        factory: async () => {
          const dataSource = new DataSource(
            typeormTestConfig as DataSourceOptions,
          );
          return dataSource.initialize();
        },
      })
      .overrideProvider(RabbitmqService)
      .useValue(rabbitmqServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function dlqMessage(orderId: string) {
    return {
      content: Buffer.from(
        JSON.stringify({
          orderId,
          userId: randomUUID(),
          amount: 100,
          items: [{ productId: 'product-1', quantity: 1, price: 100 }],
          paymentMethod: 'pix',
        }),
      ),
      properties: { messageId: 'msg-1', timestamp: Date.now(), headers: {} },
    };
  }

  describe('GET /dlq/stats', () => {
    it('returns the DLQ statistics from the mocked channel', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 2,
        consumerCount: 0,
      });

      const res = await request(app.getHttpServer())
        .get('/dlq/stats')
        .expect(200);

      expect(res.body).toEqual({
        queueName: 'payment_queue.dlq',
        messageCount: 2,
        consumerCount: 0,
      });
    });
  });

  describe('GET /dlq/messages', () => {
    it('returns messages peeked from the DLQ without removing them', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 1,
        consumerCount: 0,
      });
      channel.get
        .mockResolvedValueOnce(dlqMessage('order-1'))
        .mockResolvedValue(false);

      const res = await request(app.getHttpServer())
        .get('/dlq/messages?limit=5')
        .expect(200);

      expect(res.body.count).toBe(1);
      expect(res.body.messages[0].content.orderId).toBe('order-1');
      expect(channel.nack).toHaveBeenCalled();
      expect(channel.ack).not.toHaveBeenCalled();
    });
  });

  describe('POST /dlq/reprocess/:orderId', () => {
    it('republishes the message and returns success when it exists', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 1,
        consumerCount: 0,
      });
      channel.get.mockResolvedValueOnce(dlqMessage('order-1'));

      const res = await request(app.getHttpServer())
        .post('/dlq/reprocess/order-1')
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('returns 404 when the message is not in the DLQ', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 0,
        consumerCount: 0,
      });
      channel.get.mockResolvedValue(false);

      await request(app.getHttpServer())
        .post('/dlq/reprocess/missing-order')
        .expect(404);
    });
  });

  describe('POST /dlq/reprocess-all', () => {
    it('reprocesses every message currently in the DLQ', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 2,
        consumerCount: 0,
      });
      channel.get
        .mockResolvedValueOnce(dlqMessage('order-1'))
        .mockResolvedValueOnce(dlqMessage('order-2'));

      const res = await request(app.getHttpServer())
        .post('/dlq/reprocess-all')
        .expect(201);

      expect(res.body).toEqual({ success: true, processed: 2, failed: 0 });
    });
  });

  describe('DELETE /dlq/message/:orderId', () => {
    it('discards the message and returns success', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 1,
        consumerCount: 0,
      });
      channel.get.mockResolvedValueOnce(dlqMessage('order-1'));

      const res = await request(app.getHttpServer())
        .delete('/dlq/message/order-1')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('returns 404 when the message is not found', async () => {
      channel.checkQueue.mockResolvedValue({
        messageCount: 0,
        consumerCount: 0,
      });
      channel.get.mockResolvedValue(false);

      await request(app.getHttpServer())
        .delete('/dlq/message/missing-order')
        .expect(404);
    });
  });

  describe('DELETE /dlq/purge', () => {
    it('purges all messages from the DLQ', async () => {
      channel.purgeQueue.mockResolvedValue({ messageCount: 4 });

      const res = await request(app.getHttpServer())
        .delete('/dlq/purge')
        .expect(200);

      expect(res.body).toEqual({ success: true, purgedCount: 4 });
    });
  });
});
