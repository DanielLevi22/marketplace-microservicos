import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface LoginResponseBody {
  user: { id: string; email: string };
  token: string;
}

interface ProductResponseBody {
  id: string;
}

interface CartResponseBody {
  total: number;
  items: Array<{ productId: string; quantity: number }>;
}

interface OrderResponseBody {
  id: string;
  status: string;
  total: number;
}

// Spec 02-integracao-checkout-service.md: /cart/* e /orders/* encaminhados
// ao checkout-service via ProxyService, protegidos por JwtAuthGuard,
// repassando o header Authorization. Requer users-service, products-service
// e checkout-service reais rodando (mesmo padrão dos demais e2e do gateway,
// sem mocks).
describe('Checkout (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const registerAndLogin = async (role: 'seller' | 'buyer') => {
    const email = `checkout-e2e-${role}-${randomUUID()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'secret123',
        firstName: 'Jane',
        lastName: 'Doe',
        role,
      })
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'secret123' })
      .expect(200);

    return loginResponse.body as LoginResponseBody;
  };

  const createProduct = async (sellerToken: string) => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: `Produto e2e ${randomUUID()}`,
        description: 'Produto para teste e2e de checkout',
        price: 100,
        stock: 10,
      })
      .expect(201);

    return (response.body as ProductResponseBody).id;
  };

  it('/cart (GET), /cart/items (POST), /cart/items/:itemId (DELETE), /cart/checkout (POST) and /orders (GET) all return 401 without a token', async () => {
    await request(app.getHttpServer()).get('/cart').expect(401);
    await request(app.getHttpServer())
      .post('/cart/items')
      .send({ productId: randomUUID(), quantity: 1 })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/cart/items/${randomUUID()}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/cart/checkout')
      .send({ paymentMethod: 'pix' })
      .expect(401);
    await request(app.getHttpServer()).get('/orders').expect(401);
    await request(app.getHttpServer())
      .get(`/orders/${randomUUID()}`)
      .expect(401);
  }, 20000);

  it(
    'completes the full flow through the gateway: login -> add to cart -> ' +
      'view cart -> checkout -> view orders',
    async () => {
      const seller = await registerAndLogin('seller');
      const productId = await createProduct(seller.token);

      const buyer = await registerAndLogin('buyer');

      const addResponse = await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ productId, quantity: 2 })
        .expect(201);
      const addedCart = addResponse.body as CartResponseBody;
      expect(addedCart.items).toHaveLength(1);
      expect(addedCart.total).toBe(200);

      const cartResponse = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${buyer.token}`)
        .expect(200);
      expect((cartResponse.body as CartResponseBody).total).toBe(200);

      const checkoutResponse = await request(app.getHttpServer())
        .post('/cart/checkout')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ paymentMethod: 'pix' })
        .expect(201);
      const order = checkoutResponse.body as OrderResponseBody;
      expect(order.status).toBe('pending');
      expect(order.total).toBe(200);

      const ordersResponse = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${buyer.token}`)
        .expect(200);
      const orders = ordersResponse.body as OrderResponseBody[];
      expect(orders.some((o) => o.id === order.id)).toBe(true);

      const orderDetailResponse = await request(app.getHttpServer())
        .get(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .expect(200);
      expect((orderDetailResponse.body as OrderResponseBody).id).toBe(order.id);

      await request(app.getHttpServer())
        .get(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${seller.token}`)
        .expect(404);
    },
    30000,
  );
});
