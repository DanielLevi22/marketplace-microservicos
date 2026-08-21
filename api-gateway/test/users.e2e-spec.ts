import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { of } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import * as jwt from 'jsonwebtoken';
import { AppModule } from './../src/app.module';

interface LoginResponseBody {
  user: { id: string; email: string };
  token: string;
}

interface MockedHttpService {
  request: jest.Mock;
}

// Spec 06-integracao-api-gateway.md RF06/RF07: /users/* encaminhado ao
// users-service via ProxyService, protegido por JwtAuthGuard, repassando o
// header Authorization.
//
// Spec 05-testes-automatizados.md RF06: users-service mockado via
// HttpService (mesmo padrão de auth.e2e-spec.ts) — sem depender de um
// users-service real rodando.
describe('UsersController (e2e)', () => {
  let app: INestApplication<App>;
  let httpService: MockedHttpService;

  const usersDb = new Map<string, { id: string; email: string }>();

  beforeEach(async () => {
    usersDb.clear();
    httpService = { request: jest.fn() };

    httpService.request.mockImplementation(
      (config: {
        method: string;
        url: string;
        data?: unknown;
        headers?: Record<string, string>;
      }) => {
        const { method, url, data, headers } = config;

        if (method === 'post' && url.endsWith('/auth/register')) {
          const body = data as { email: string };
          const user = { id: randomUUID(), email: body.email };
          usersDb.set(user.id, user);
          return of({ data: user, status: 201 });
        }

        if (method === 'post' && url.endsWith('/auth/login')) {
          const body = data as { email: string };
          const user = [...usersDb.values()].find(
            (u) => u.email === body.email,
          );
          const token = jwt.sign(
            { sub: user?.id, email: user?.email, role: 'buyer' },
            process.env.JWT_SECRET as string,
            { expiresIn: '24h' },
          );
          return of({ data: { user, token }, status: 200 });
        }

        if (method === 'get' && url.endsWith('/users/profile')) {
          return of({
            data: usersDb.get(headers?.['x-user-id'] ?? ''),
            status: 200,
          });
        }

        if (method === 'get' && url.endsWith('/users/sellers')) {
          return of({ data: [], status: 200 });
        }

        throw new Error(`Unexpected HttpService.request call: ${url}`);
      },
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(HttpService)
      .useValue(httpService)
      .compile();

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
  });

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
  });
});
