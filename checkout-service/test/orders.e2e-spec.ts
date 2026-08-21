import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { DataSource, DataSourceOptions, Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { databaseConfig } from '../src/config/database.config';
import { CartModule } from '../src/cart/cart.module';
import { OrdersModule } from '../src/orders/orders.module';
import { AuthModule } from '../src/auth/auth.module';
import { EventsModule } from '../src/events/events.module';
import { MetricsModule } from '../src/metrics/metrics.module';
import {
  ProductResponse,
  ProductsClientService,
} from '../src/cart/products-client.service';
import { PaymentQueueService } from '../src/events/payment-queue/payment-queue.service';
import { Cart } from '../src/cart/entities/cart.entity';
import { Order } from '../src/orders/entities/order.entity';
import { OrderResponse } from '../src/orders/orders.service';
import { typeormTestConfig } from './utils/typeorm-test.config';

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let cartRepository: Repository<Cart>;
  let orderRepository: Repository<Order>;
  let productsClientService: { findById: jest.Mock };
  let paymentQueueService: { publishPaymentOrder: jest.Mock };

  beforeAll(async () => {
    productsClientService = { findById: jest.fn() };
    paymentQueueService = { publishPaymentOrder: jest.fn() };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot(databaseConfig),
        CartModule,
        OrdersModule,
        AuthModule,
        EventsModule,
        MetricsModule,
        JwtModule.register({
          secret: process.env.JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
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
      .overrideProvider(ProductsClientService)
      .useValue(productsClientService)
      .overrideProvider(PaymentQueueService)
      .useValue(paymentQueueService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwtService = moduleFixture.get(JwtService);
    cartRepository = moduleFixture.get(getRepositoryToken(Cart));
    orderRepository = moduleFixture.get(getRepositoryToken(Order));
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    productsClientService.findById.mockReset();
    paymentQueueService.publishPaymentOrder.mockReset();
  });

  function tokenFor(userId: string, role: 'buyer' | 'seller' = 'buyer') {
    return jwtService.sign({
      sub: userId,
      email: `${userId}@example.com`,
      role,
    });
  }

  function mockProduct(
    overrides: Partial<ProductResponse> = {},
  ): ProductResponse {
    return {
      id: randomUUID(),
      name: 'Mouse',
      price: 29.9,
      stock: 10,
      isActive: true,
      sellerId: randomUUID(),
      ...overrides,
    };
  }

  async function addItemToCart(
    userId: string,
    product: ProductResponse,
    quantity = 1,
  ) {
    productsClientService.findById.mockResolvedValueOnce(product);

    return request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send({ productId: product.id, quantity })
      .expect(201);
  }

  async function cleanupUser(userId: string) {
    await orderRepository.delete({ userId });
    await cartRepository.delete({ userId });
  }

  describe('POST /cart/checkout', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/cart/checkout')
        .send({ paymentMethod: 'pix' })
        .expect(401);
    });

    it.each([
      ['missing paymentMethod', {}],
      ['invalid paymentMethod', { paymentMethod: 'cash' }],
    ])('rejects an invalid payload (%s)', async (_label, body) => {
      const userId = randomUUID();

      await request(app.getHttpServer())
        .post('/cart/checkout')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send(body)
        .expect(400);

      await cleanupUser(userId);
    });

    it('rejects when the user has no active cart', async () => {
      const userId = randomUUID();

      await request(app.getHttpServer())
        .post('/cart/checkout')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ paymentMethod: 'pix' })
        .expect(400);

      expect(paymentQueueService.publishPaymentOrder).not.toHaveBeenCalled();
      await cleanupUser(userId);
    });

    it('rejects when the active cart has no items', async () => {
      const userId = randomUUID();
      const product = mockProduct();

      const addResponse = await addItemToCart(userId, product);
      const itemId = (addResponse.body as { items: { id: string }[] }).items[0]
        .id;

      await request(app.getHttpServer())
        .delete(`/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/cart/checkout')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ paymentMethod: 'pix' })
        .expect(400);

      await cleanupUser(userId);
    });

    it('creates a pending order, completes the cart and publishes the payment message', async () => {
      const userId = randomUUID();
      const product = mockProduct({ price: 29.9 });

      await addItemToCart(userId, product, 2);

      const response = await request(app.getHttpServer())
        .post('/cart/checkout')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ paymentMethod: 'credit_card' })
        .expect(201);

      const body = response.body as OrderResponse;
      expect(body.userId).toBe(userId);
      expect(body.status).toBe('pending');
      expect(body.paymentMethod).toBe('credit_card');
      expect(body.total).toBe(59.8);

      expect(paymentQueueService.publishPaymentOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: body.id,
          userId,
          amount: 59.8,
          paymentMethod: 'credit_card',
          items: [{ productId: product.id, quantity: 2, price: 29.9 }],
        }),
      );

      const cartRow = await cartRepository.findOne({
        where: { userId, status: 'active' },
      });
      expect(cartRow).toBeNull();

      await cleanupUser(userId);
    });

    it('starts a new active cart after checkout, separate from the completed one', async () => {
      const userId = randomUUID();
      const firstProduct = mockProduct({ price: 10 });
      const secondProduct = mockProduct({ price: 15 });

      await addItemToCart(userId, firstProduct);
      await request(app.getHttpServer())
        .post('/cart/checkout')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ paymentMethod: 'pix' })
        .expect(201);

      await addItemToCart(userId, secondProduct);

      const cartResponse = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .expect(200);

      expect(cartResponse.body).toMatchObject({
        status: 'active',
        total: 15,
      });

      await cleanupUser(userId);
    });
  });

  describe('GET /orders', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/orders').expect(401);
    });

    it('returns an empty list when the user has no orders', async () => {
      const userId = randomUUID();

      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('returns only the user orders, ordered from most recent to oldest', async () => {
      const userId = randomUUID();

      await addItemToCart(userId, mockProduct({ price: 10 }));
      const first = await request(app.getHttpServer())
        .post('/cart/checkout')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ paymentMethod: 'pix' })
        .expect(201);

      // SQLite (better-sqlite3) stores createdAt with second-level precision,
      // so two orders created back-to-back can tie. Backdate the first order
      // to make the DESC ordering assertion below deterministic.
      await orderRepository.update((first.body as OrderResponse).id, {
        createdAt: new Date(Date.now() - 5000),
      });

      await addItemToCart(userId, mockProduct({ price: 20 }));
      const second = await request(app.getHttpServer())
        .post('/cart/checkout')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ paymentMethod: 'boleto' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .expect(200);

      const body = response.body as OrderResponse[];
      expect(body).toHaveLength(2);
      expect(body[0].id).toBe((second.body as OrderResponse).id);
      expect(body[1].id).toBe((first.body as OrderResponse).id);

      await cleanupUser(userId);
    });

    it("never returns another user's orders", async () => {
      const userA = randomUUID();
      const userB = randomUUID();

      await addItemToCart(userA, mockProduct({ price: 10 }));
      await request(app.getHttpServer())
        .post('/cart/checkout')
        .set('Authorization', `Bearer ${tokenFor(userA)}`)
        .send({ paymentMethod: 'pix' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${tokenFor(userB)}`)
        .expect(200);

      expect(response.body).toEqual([]);

      await cleanupUser(userA);
      await cleanupUser(userB);
    });
  });

  describe('GET /orders/:id', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get(`/orders/${randomUUID()}`)
        .expect(401);
    });

    it('returns 404 for a nonexistent id', async () => {
      const userId = randomUUID();

      await request(app.getHttpServer())
        .get(`/orders/${randomUUID()}`)
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .expect(404);
    });

    it("returns 404 for another user's order", async () => {
      const userA = randomUUID();
      const userB = randomUUID();

      await addItemToCart(userA, mockProduct({ price: 10 }));
      const checkoutResponse = await request(app.getHttpServer())
        .post('/cart/checkout')
        .set('Authorization', `Bearer ${tokenFor(userA)}`)
        .send({ paymentMethod: 'pix' })
        .expect(201);
      const orderId = (checkoutResponse.body as OrderResponse).id;

      await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${tokenFor(userB)}`)
        .expect(404);

      await cleanupUser(userA);
      await cleanupUser(userB);
    });

    it('returns the full order data for the owner', async () => {
      const userId = randomUUID();
      const product = mockProduct({ price: 12.5 });

      await addItemToCart(userId, product, 2);
      const checkoutResponse = await request(app.getHttpServer())
        .post('/cart/checkout')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ paymentMethod: 'debit_card' })
        .expect(201);
      const orderId = (checkoutResponse.body as OrderResponse).id;

      const response = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .expect(200);

      const body = response.body as OrderResponse;
      expect(body).toMatchObject({
        id: orderId,
        userId,
        status: 'pending',
        paymentMethod: 'debit_card',
        total: 25,
      });

      await cleanupUser(userId);
    });
  });
});
