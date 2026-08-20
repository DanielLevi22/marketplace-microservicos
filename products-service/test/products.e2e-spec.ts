import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Product } from '../src/products/entities/product.entity';

const JWT_SECRET = 'e2e-test-secret';

describe('Products (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let productsRepository: Repository<Product>;

  beforeAll(async () => {
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = JWT_SECRET;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    process.env.JWT_SECRET = originalSecret;

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwtService = new JwtService({ secret: JWT_SECRET });
    productsRepository = moduleFixture.get(getRepositoryToken(Product));
    await productsRepository.clear();
  });

  afterAll(async () => {
    await productsRepository.clear();
    await app.close();
  });

  function signToken(role: string, sub = randomUUID()) {
    return jwtService.sign({ sub, email: 'seller@example.com', role });
  }

  const validPayload = {
    name: 'Produto Teste',
    description: 'Descrição do produto de teste',
    price: 19.9,
    stock: 5,
  };

  it('returns 401 without a token', () => {
    return request(app.getHttpServer())
      .post('/products')
      .send(validPayload)
      .expect(401);
  });

  it('returns 403 when the authenticated user is a buyer', async () => {
    const token = signToken('buyer');
    const before = await productsRepository.count();

    await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload)
      .expect(403);

    const after = await productsRepository.count();
    expect(after).toBe(before);
  });

  it('returns 201 and creates the product when the user is a seller', async () => {
    const sub = randomUUID();
    const token = signToken('seller', sub);

    const res = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload)
      .expect(201);

    expect(res.body).toMatchObject({
      name: validPayload.name,
      description: validPayload.description,
      sellerId: sub,
      isActive: true,
    });
  });

  it('returns 400 when name is missing', async () => {
    const token = signToken('seller');
    const { name, ...rest } = validPayload;
    void name;

    return request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send(rest)
      .expect(400);
  });

  it('returns 400 when name exceeds 255 characters', async () => {
    const token = signToken('seller');

    return request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload, name: 'a'.repeat(256) })
      .expect(400);
  });

  it('returns 400 when description is missing', async () => {
    const token = signToken('seller');
    const { description, ...rest } = validPayload;
    void description;

    return request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send(rest)
      .expect(400);
  });

  it('returns 400 when price is missing', async () => {
    const token = signToken('seller');
    const { price, ...rest } = validPayload;
    void price;

    return request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send(rest)
      .expect(400);
  });

  it('returns 400 when price is zero or negative', async () => {
    const token = signToken('seller');

    return request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload, price: 0 })
      .expect(400);
  });

  it('returns 400 when price has more than 2 decimal places', async () => {
    const token = signToken('seller');

    return request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload, price: 19.999 })
      .expect(400);
  });

  it('returns 400 when stock is missing', async () => {
    const token = signToken('seller');
    const { stock, ...rest } = validPayload;
    void stock;

    return request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send(rest)
      .expect(400);
  });

  it('returns 400 when stock is negative', async () => {
    const token = signToken('seller');

    return request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload, stock: -1 })
      .expect(400);
  });

  it('returns 400 when stock is not an integer', async () => {
    const token = signToken('seller');

    return request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload, stock: 1.5 })
      .expect(400);
  });

  it('returns 400 when the body includes sellerId', async () => {
    const token = signToken('seller');

    return request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload, sellerId: randomUUID() })
      .expect(400);
  });

  describe('GET /products', () => {
    afterEach(async () => {
      await productsRepository.clear();
    });

    it('returns 200 without a token', () => {
      return request(app.getHttpServer()).get('/products').expect(200);
    });

    it('returns only active products ordered by createdAt desc', async () => {
      const older = await productsRepository.save(
        productsRepository.create({
          ...validPayload,
          sellerId: randomUUID(),
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }),
      );
      const newer = await productsRepository.save(
        productsRepository.create({
          ...validPayload,
          sellerId: randomUUID(),
          isActive: true,
          createdAt: new Date('2026-01-02T00:00:00Z'),
        }),
      );
      await productsRepository.save(
        productsRepository.create({
          ...validPayload,
          sellerId: randomUUID(),
          isActive: false,
        }),
      );

      const res = await request(app.getHttpServer())
        .get('/products')
        .expect(200);

      const body = res.body as Array<{ id: string }>;
      expect(body).toHaveLength(2);
      expect(body.map((p) => p.id)).toEqual([newer.id, older.id]);
    });
  });

  describe('GET /products/seller/:sellerId', () => {
    afterEach(async () => {
      await productsRepository.clear();
    });

    it('returns 200 without a token', () => {
      return request(app.getHttpServer())
        .get(`/products/seller/${randomUUID()}`)
        .expect(200);
    });

    it('returns only active products of the given seller', async () => {
      const sellerId = randomUUID();
      const otherSellerId = randomUUID();

      const ownProduct = await productsRepository.save(
        productsRepository.create({
          ...validPayload,
          sellerId,
          isActive: true,
        }),
      );
      await productsRepository.save(
        productsRepository.create({
          ...validPayload,
          sellerId,
          isActive: false,
        }),
      );
      await productsRepository.save(
        productsRepository.create({
          ...validPayload,
          sellerId: otherSellerId,
          isActive: true,
        }),
      );

      const res = await request(app.getHttpServer())
        .get(`/products/seller/${sellerId}`)
        .expect(200);

      const body = res.body as Array<{ id: string }>;
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(ownProduct.id);
    });

    it('returns an empty list when the seller has no products', async () => {
      const res = await request(app.getHttpServer())
        .get(`/products/seller/${randomUUID()}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('GET /products/:id', () => {
    afterEach(async () => {
      await productsRepository.clear();
    });

    it('returns 200 without a token', async () => {
      const product = await productsRepository.save(
        productsRepository.create({
          ...validPayload,
          sellerId: randomUUID(),
          isActive: true,
        }),
      );

      return request(app.getHttpServer())
        .get(`/products/${product.id}`)
        .expect(200);
    });

    it('returns the product data when it exists', async () => {
      const product = await productsRepository.save(
        productsRepository.create({
          ...validPayload,
          sellerId: randomUUID(),
          isActive: true,
        }),
      );

      const res = await request(app.getHttpServer())
        .get(`/products/${product.id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: product.id,
        name: validPayload.name,
        sellerId: product.sellerId,
      });
    });

    it('returns 404 when the product does not exist', () => {
      return request(app.getHttpServer())
        .get(`/products/${randomUUID()}`)
        .expect(404);
    });
  });
});
