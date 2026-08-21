import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RabbitmqService } from '../src/events/rabbitmq/rabbitmq.service';
import { typeormTestConfig } from './utils/typeorm-test.config';
import { createRabbitmqServiceMock } from './utils/rabbitmq-mock';

describe('Consumer Metrics (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
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
      .useValue(createRabbitmqServiceMock())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /consumer-metrics', () => {
    it('returns the current consumer metrics with success rate and uptime', async () => {
      const res = await request(app.getHttpServer())
        .get('/consumer-metrics')
        .expect(200);

      expect(res.body).toMatchObject({
        totalProcessed: 0,
        totalSuccess: 0,
        totalFailed: 0,
        status: 'active',
        successRate: '0%',
      });
      expect(typeof res.body.uptime).toBe('string');
    });
  });

  describe('GET /consumer-metrics/health', () => {
    it('returns healthy status when nothing has been processed yet', async () => {
      const res = await request(app.getHttpServer())
        .get('/consumer-metrics/health')
        .expect(200);

      expect(res.body).toMatchObject({
        status: 'healthy',
        checks: {
          isProcessing: true,
          hasGoodSuccessRate: true,
          hasLowFailures: true,
        },
      });
    });
  });

  describe('GET /consumer-metrics/summary', () => {
    it('returns the processed/success/failed summary', async () => {
      const res = await request(app.getHttpServer())
        .get('/consumer-metrics/summary')
        .expect(200);

      expect(res.body).toEqual({
        processed: 0,
        success: 0,
        failed: 0,
        rate: '0%',
        avgTime: '0ms',
      });
    });
  });

  describe('POST /consumer-metrics/reset', () => {
    it('resets the metrics and confirms it via a subsequent read', async () => {
      const res = await request(app.getHttpServer())
        .post('/consumer-metrics/reset')
        .expect(201);

      expect(res.body).toEqual({
        success: true,
        message: 'Metrics reset successfully',
      });

      const after = await request(app.getHttpServer())
        .get('/consumer-metrics/summary')
        .expect(200);

      expect(after.body.processed).toBe(0);
    });
  });
});
