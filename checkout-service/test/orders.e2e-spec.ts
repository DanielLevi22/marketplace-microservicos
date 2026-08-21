import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { databaseConfig } from '../src/config/database.config';
import { CartModule } from '../src/cart/cart.module';
import { OrdersModule } from '../src/orders/orders.module';
import { AuthModule } from '../src/auth/auth.module';
import { EventsModule } from '../src/events/events.module';
import {
  ProductResponse,
  ProductsClientService,
} from '../src/cart/products-client.service';
import { PaymentQueueService } from '../src/events/payment-queue/payment-queue.service';
import { Cart } from '../src/cart/entities/cart.entity';
import { Order } from '../src/orders/entities/order.entity';
import { OrderResponse } from '../src/orders/orders.service';

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
        JwtModule.register({
          secret: process.env.JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
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
      const itemId = (addResponse.body as { items: { id: string }[] })
        .items[0].id;

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
});
