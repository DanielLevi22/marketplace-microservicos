import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AppModule } from './../src/app.module';
import { RetryService } from '../src/common/retry/retry.service';
import { TimeoutService } from '../src/common/timeout/timeout.service';

// Spec 05-testes-automatizados.md RF02: e2e de /auth/login e /auth/register
// com o users-service totalmente mockado via HttpService (ProxyService usa
// `httpService.request(...)` internamente, não `.post`/`.get`). Cobre o
// sucesso, o repasse de erro 4xx real (regressão de
// 01-repasse-erros-autenticacao.md) e a regressão do bug desta spec: falha
// de conectividade (sem `error.response`, como ECONNREFUSED) deve resultar
// em 503, nunca 401.
//
// RetryService e TimeoutService são substituídos por versões "rápidas" só
// para este arquivo de teste: elas preservam a mesma lógica de curto-circuito
// (não faz retry de HttpException 4xx; senão, tenta de novo) mas sem os
// delays reais de backoff exponencial (que somados podem passar de 10s) nem
// o timeout real de 10s por tentativa, senão o cenário de indisponibilidade
// ficaria lento e deixaria timers pendentes após o teste.
// CircuitBreakerService é mantido real: cada teste sobe uma instância nova
// do AppModule (beforeEach), então o estado por chave nunca vaza entre testes.
class FastRetryService {
  async executeWithExponentialBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() < 500) {
          throw error;
        }

        lastError = error;
      }
    }

    throw lastError;
  }
}

class ImmediateTimeoutService {
  async executeWithCustomTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }
}

interface MockedHttpService {
  request: jest.Mock;
}

const registerPayload = {
  email: 'jane@example.com',
  password: 'secret123',
  firstName: 'Jane',
  lastName: 'Doe',
  role: 'buyer',
};

const loginPayload = {
  email: 'jane@example.com',
  password: 'secret123',
};

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let httpService: MockedHttpService;

  beforeEach(async () => {
    httpService = { request: jest.fn() };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(HttpService)
      .useValue(httpService)
      .overrideProvider(RetryService)
      .useValue(new FastRetryService())
      .overrideProvider(TimeoutService)
      .useValue(new ImmediateTimeoutService())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('proxies the users-service success response', async () => {
      const successBody = { user: { id: 'uuid-1' }, token: 'jwt-token' };
      httpService.request.mockReturnValue(
        of({ data: successBody, status: 200 }),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginPayload)
        .expect(200);

      expect(response.body).toEqual(successBody);
    });

    it('repasses a real 4xx error from the users service unchanged', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 401, data: { message: 'Invalid credentials' } },
      };
      httpService.request.mockReturnValue(throwError(() => axiosError));

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginPayload)
        .expect(401);

      expect(response.body).toMatchObject({ message: 'Invalid credentials' });
    });

    it('returns 503, not 401, when the users service is unreachable', async () => {
      const connectionRefused = {
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED',
      };
      httpService.request.mockReturnValue(
        throwError(() => connectionRefused),
      );

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginPayload)
        .expect(503);
    }, 15000);
  });

  describe('POST /auth/register', () => {
    it('proxies the users-service success response', async () => {
      const successBody = { id: 'uuid-1', email: registerPayload.email };
      httpService.request.mockReturnValue(
        of({ data: successBody, status: 201 }),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerPayload)
        .expect(201);

      expect(response.body).toEqual(successBody);
    });

    it('repasses a real 4xx error from the users service unchanged', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 409,
          data: { message: 'Email already registered' },
        },
      };
      httpService.request.mockReturnValue(throwError(() => axiosError));

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerPayload)
        .expect(409);

      expect(response.body).toMatchObject({
        message: 'Email already registered',
      });
    });

    it('returns 503, not 401, when the users service is unreachable', async () => {
      const connectionRefused = {
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED',
      };
      httpService.request.mockReturnValue(
        throwError(() => connectionRefused),
      );

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerPayload)
        .expect(503);
    }, 15000);
  });
});
