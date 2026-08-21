import { randomUUID } from 'crypto';
import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { DataSource, DataSourceOptions, Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { databaseConfig } from '../src/config/database.config';
import { CartModule } from '../src/cart/cart.module';
import { AuthModule } from '../src/auth/auth.module';
import {
  ProductResponse,
  ProductsClientService,
} from '../src/cart/products-client.service';
import { Cart } from '../src/cart/entities/cart.entity';
import { CartResponse } from '../src/cart/cart.service';
import { typeormTestConfig } from './utils/typeorm-test.config';

describe('Cart (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let cartRepository: Repository<Cart>;
  let productsClientService: { findById: jest.Mock };

  beforeAll(async () => {
    productsClientService = { findById: jest.fn() };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot(databaseConfig),
        CartModule,
        AuthModule,
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
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    productsClientService.findById.mockReset();
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

  async function cleanupCart(userId: string) {
    await cartRepository.delete({ userId });
  }

  describe('POST /cart/items', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .send({ productId: randomUUID(), quantity: 1 })
        .expect(401);
    });

    it('rejects when the product does not exist in products-service', async () => {
      const userId = randomUUID();
      productsClientService.findById.mockRejectedValue(
        new NotFoundException('Produto não encontrado'),
      );

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ productId: randomUUID(), quantity: 1 })
        .expect(404);

      await cleanupCart(userId);
    });

    it('rejects an inactive product', async () => {
      const userId = randomUUID();
      const product = mockProduct({ isActive: false });
      productsClientService.findById.mockResolvedValue(product);

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ productId: product.id, quantity: 1 })
        .expect(400);

      await cleanupCart(userId);
    });

    it.each([
      ['quantity 0', { quantity: 0 }],
      ['missing quantity', {}],
      ['non-integer quantity', { quantity: 'abc' }],
    ])('rejects an invalid quantity (%s)', async (_label, quantityOverride) => {
      const userId = randomUUID();

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ productId: randomUUID(), ...quantityOverride })
        .expect(400);

      await cleanupCart(userId);
    });

    it('creates a cart on demand with a productName/price snapshot and correct subtotal', async () => {
      const userId = randomUUID();
      const product = mockProduct({ name: 'Teclado', price: 150.5 });
      productsClientService.findById.mockResolvedValue(product);

      const response = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ productId: product.id, quantity: 2 })
        .expect(201);

      const body = response.body as CartResponse;
      expect(body.userId).toBe(userId);
      expect(body.status).toBe('active');
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        productId: product.id,
        productName: 'Teclado',
        price: 150.5,
        quantity: 2,
        subtotal: 301,
      });
      expect(body.total).toBe(301);

      await cleanupCart(userId);
    });

    it('sums quantity into a single item when the same product is added twice', async () => {
      const userId = randomUUID();
      const product = mockProduct({ price: 10 });
      productsClientService.findById.mockResolvedValue(product);

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ productId: product.id, quantity: 1 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ productId: product.id, quantity: 2 })
        .expect(201);

      const body = response.body as CartResponse;
      expect(body.items).toHaveLength(1);
      expect(body.items[0].quantity).toBe(3);
      expect(body.items[0].subtotal).toBe(30);
      expect(body.total).toBe(30);

      await cleanupCart(userId);
    });

    it('recomputes the total as the sum of all item subtotals', async () => {
      const userId = randomUUID();
      const productA = mockProduct({ price: 10 });
      const productB = mockProduct({ price: 20 });

      productsClientService.findById.mockResolvedValueOnce(productA);
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ productId: productA.id, quantity: 1 })
        .expect(201);

      productsClientService.findById.mockResolvedValueOnce(productB);
      const response = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ productId: productB.id, quantity: 2 })
        .expect(201);

      const body = response.body as CartResponse;
      expect(body.total).toBe(50);

      await cleanupCart(userId);
    });
  });

  describe('GET /cart', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/cart').expect(401);
    });

    it('returns an empty cart without creating a row when the user has no active cart', async () => {
      const userId = randomUUID();

      const response = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .expect(200);

      const body = response.body as CartResponse;
      expect(body).toEqual({
        userId,
        status: 'active',
        items: [],
        total: 0,
      });

      const cartRow = await cartRepository.findOne({ where: { userId } });
      expect(cartRow).toBeNull();
    });

    it('returns the items and total of the user active cart', async () => {
      const userId = randomUUID();
      const product = mockProduct({ price: 15 });
      productsClientService.findById.mockResolvedValue(product);

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ productId: product.id, quantity: 2 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .expect(200);

      const body = response.body as CartResponse;
      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(30);

      await cleanupCart(userId);
    });

    it('never returns another user cart', async () => {
      const userA = randomUUID();
      const userB = randomUUID();
      const product = mockProduct({ price: 15 });
      productsClientService.findById.mockResolvedValue(product);

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenFor(userA)}`)
        .send({ productId: product.id, quantity: 1 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenFor(userB)}`)
        .expect(200);

      const body = response.body as CartResponse;
      expect(body.items).toHaveLength(0);
      expect(body.total).toBe(0);

      await cleanupCart(userA);
      await cleanupCart(userB);
    });
  });

  describe('DELETE /cart/items/:itemId', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .delete(`/cart/items/${randomUUID()}`)
        .expect(401);
    });

    it('rejects a nonexistent itemId', async () => {
      const userId = randomUUID();

      await request(app.getHttpServer())
        .delete(`/cart/items/${randomUUID()}`)
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .expect(404);
    });

    it("rejects an itemId that belongs to another user's cart, leaving it unchanged", async () => {
      const userA = randomUUID();
      const userB = randomUUID();
      const product = mockProduct({ price: 15 });
      productsClientService.findById.mockResolvedValue(product);

      const addResponse = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenFor(userA)}`)
        .send({ productId: product.id, quantity: 1 })
        .expect(201);
      const itemId = (addResponse.body as CartResponse).items[0].id;

      await request(app.getHttpServer())
        .delete(`/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${tokenFor(userB)}`)
        .expect(404);

      const cartA = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${tokenFor(userA)}`)
        .expect(200);
      expect((cartA.body as CartResponse).items).toHaveLength(1);

      await cleanupCart(userA);
      await cleanupCart(userB);
    });

    it('removes the item and recalculates the total from the remaining items', async () => {
      const userId = randomUUID();
      const productA = mockProduct({ price: 10 });
      const productB = mockProduct({ price: 20 });

      productsClientService.findById.mockResolvedValueOnce(productA);
      const firstAdd = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ productId: productA.id, quantity: 1 })
        .expect(201);
      const itemToRemove = (firstAdd.body as CartResponse).items[0].id;

      productsClientService.findById.mockResolvedValueOnce(productB);
      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send({ productId: productB.id, quantity: 1 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .delete(`/cart/items/${itemToRemove}`)
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .expect(200);

      const body = response.body as CartResponse;
      expect(body.items).toHaveLength(1);
      expect(body.items[0].productId).toBe(productB.id);
      expect(body.total).toBe(20);

      await cleanupCart(userId);
    });
  });

  describe('seller/buyer parity', () => {
    it.each<['seller' | 'buyer']>([['seller'], ['buyer']])(
      'supports the full add -> get -> delete flow for role %s',
      async (role) => {
        const userId = randomUUID();
        const product = mockProduct({ price: 25 });
        productsClientService.findById.mockResolvedValue(product);

        const addResponse = await request(app.getHttpServer())
          .post('/cart/items')
          .set('Authorization', `Bearer ${tokenFor(userId, role)}`)
          .send({ productId: product.id, quantity: 1 })
          .expect(201);
        const itemId = (addResponse.body as CartResponse).items[0].id;

        await request(app.getHttpServer())
          .get('/cart')
          .set('Authorization', `Bearer ${tokenFor(userId, role)}`)
          .expect(200);

        await request(app.getHttpServer())
          .delete(`/cart/items/${itemId}`)
          .set('Authorization', `Bearer ${tokenFor(userId, role)}`)
          .expect(200);

        await cleanupCart(userId);
      },
    );
  });
});
