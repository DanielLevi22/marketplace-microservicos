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

interface OrderResponseBody {
  id: string;
  status: string;
  total: number;
}

interface PaymentResponseBody {
  orderId: string;
  status: 'pending' | 'approved' | 'rejected';
  transactionId?: string;
  rejectionReason?: string;
}

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 20000;

// Spec 01-integracao-payments-gateway-e2e-completo.md: GET /payments/:orderId
// encaminhado ao payments-service via ProxyService, protegido por
// JwtAuthGuard; e fluxo de compra completo (registro -> login -> produtos ->
// carrinho -> checkout -> pagamento) executado inteiramente via gateway.
// Requer users-service, products-service, checkout-service, payments-service
// e RabbitMQ reais rodando (mesmo padrão dos demais e2e do gateway, sem mocks).
describe('Payments (e2e)', () => {
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
    const email = `payments-e2e-${role}-${randomUUID()}@test.com`;
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

  const createProduct = async (sellerToken: string, price: number) => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: `Produto e2e ${randomUUID()}`,
        description: 'Produto para teste e2e de pagamento',
        price,
        stock: 10,
      })
      .expect(201);

    return (response.body as ProductResponseBody).id;
  };

  const checkoutWithProduct = async (buyerToken: string, productId: string) => {
    await request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .get('/cart')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200);

    const checkoutResponse = await request(app.getHttpServer())
      .post('/cart/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ paymentMethod: 'pix' })
      .expect(201);
    const order = checkoutResponse.body as OrderResponseBody;

    await request(app.getHttpServer())
      .get(`/orders/${order.id}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200);

    return order.id;
  };

  const waitForPayment = async (
    orderId: string,
    token: string,
  ): Promise<PaymentResponseBody> => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const response = await request(app.getHttpServer())
        .get(`/payments/${orderId}`)
        .set('Authorization', `Bearer ${token}`);

      if (response.status === 200) {
        const payment = response.body as PaymentResponseBody;
        if (payment.status === 'approved' || payment.status === 'rejected') {
          return payment;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error(`Payment for order ${orderId} not settled in time`);
  };

  it('/payments/:orderId (GET) returns 401 without a token', async () => {
    await request(app.getHttpServer())
      .get(`/payments/${randomUUID()}`)
      .expect(401);
  }, 20000);

  it('completes the full purchase flow through the gateway and resolves both an approved and a rejected payment', async () => {
    const seller = await registerAndLogin('seller');
    const approvedProductId = await createProduct(seller.token, 100);
    const rejectedProductId = await createProduct(seller.token, 149.99);

    const buyer = await registerAndLogin('buyer');

    const catalogResponse = await request(app.getHttpServer())
      .get('/products')
      .expect(200);
    const catalog = catalogResponse.body as ProductResponseBody[];
    const catalogIds = catalog.map((p) => p.id);
    expect(catalogIds).toEqual(
      expect.arrayContaining([approvedProductId, rejectedProductId]),
    );

    const approvedOrderId = await checkoutWithProduct(
      buyer.token,
      approvedProductId,
    );
    const approvedPayment = await waitForPayment(approvedOrderId, buyer.token);
    expect(approvedPayment.status).toBe('approved');
    expect(approvedPayment.transactionId).toEqual(expect.any(String));

    const rejectedOrderId = await checkoutWithProduct(
      buyer.token,
      rejectedProductId,
    );
    const rejectedPayment = await waitForPayment(rejectedOrderId, buyer.token);
    expect(rejectedPayment.status).toBe('rejected');
    expect(rejectedPayment.rejectionReason).toBe(
      'Cartão recusado pela operadora',
    );
  }, 60000);
});
