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

// Spec 06-integracao-api-gateway.md RF06/RF07: /users/* encaminhado ao
// users-service via ProxyService, protegido por JwtAuthGuard, repassando o
// header Authorization. Requer o users-service real rodando em :3000 (mesmo
// padrão dos demais e2e do projeto, sem mocks).
describe('UsersController (e2e)', () => {
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

  const registerAndLogin = async () => {
    const email = `gateway-e2e-${randomUUID()}@test.com`;
    const payload = {
      email,
      password: 'secret123',
      firstName: 'Jane',
      lastName: 'Doe',
      role: 'buyer',
    };

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(payload)
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: payload.password })
      .expect(200);

    const body = loginResponse.body as LoginResponseBody;
    return { payload, user: body.user, token: body.token };
  };

  it('/users/profile (GET) returns 401 without an Authorization header', () => {
    return request(app.getHttpServer()).get('/users/profile').expect(401);
  });

  it('/users/profile (GET) returns the authenticated user with a valid token', async () => {
    const { payload, token } = await registerAndLogin();

    const response = await request(app.getHttpServer())
      .get('/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({ email: payload.email });
  }, 15000);

  it('/users/sellers (GET) returns 401 without an Authorization header', () => {
    return request(app.getHttpServer()).get('/users/sellers').expect(401);
  });

  it('/users/sellers (GET) returns a list with a valid token', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app.getHttpServer())
      .get('/users/sellers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  }, 15000);
});
