import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, DataSourceOptions, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Payment } from '../src/payments/entities/payment.entity';
import { RabbitmqService } from '../src/events/rabbitmq/rabbitmq.service';
import { typeormTestConfig } from './utils/typeorm-test.config';
import { createRabbitmqServiceMock } from './utils/rabbitmq-mock';

describe('Payments (e2e)', () => {
  let app: INestApplication<App>;
  let paymentsRepository: Repository<Payment>;

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

    paymentsRepository = moduleFixture.get(getRepositoryToken(Payment));
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /payments/:orderId', () => {
    it('returns 404 when there is no payment for the given orderId', () => {
      return request(app.getHttpServer())
        .get(`/payments/${randomUUID()}`)
        .expect(404);
    });

    it('returns the payment data when it exists', async () => {
      const orderId = randomUUID();
      const userId = randomUUID();

      const payment = await paymentsRepository.save(
        paymentsRepository.create({
          orderId,
          userId,
          amount: 150.5,
          status: 'approved',
          paymentMethod: 'pix',
          transactionId: 'txn-1',
          rejectionReason: null,
          processedAt: new Date(),
        }),
      );

      const res = await request(app.getHttpServer())
        .get(`/payments/${orderId}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: payment.id,
        orderId,
        userId,
        amount: 150.5,
        status: 'approved',
        paymentMethod: 'pix',
        transactionId: 'txn-1',
      });
    });
  });
});
