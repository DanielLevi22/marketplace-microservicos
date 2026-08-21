import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Payment } from '../src/payments/entities/payment.entity';

describe('Payments (e2e)', () => {
  let app: INestApplication<App>;
  let paymentsRepository: Repository<Payment>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    paymentsRepository = moduleFixture.get(getRepositoryToken(Payment));
    await paymentsRepository.clear();
  });

  afterAll(async () => {
    await paymentsRepository.clear();
    await app.close();
  });

  afterEach(async () => {
    await paymentsRepository.clear();
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
