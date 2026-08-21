import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, DataSourceOptions } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { UserRole } from '../src/users/entities/user.entity';
import { typeormTestConfig } from './utils/typeorm-test.config';

// GET / não é marcada como @Public() e serve como rota-referência para os
// testes do JwtAuthGuard global (spec 04-guards-protecao-rotas-jwt.md).
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
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
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    jwtService = app.get(JwtService);
  });

  afterEach(async () => {
    await app.close();
  });

  const validPayload = () => ({
    sub: 'uuid-1',
    email: 'jane@example.com',
    role: UserRole.BUYER,
  });

  // RF06/AC1: token ausente em rota protegida retorna 401
  it('/ (GET) returns 401 without an Authorization header', () => {
    return request(app.getHttpServer()).get('/').expect(401);
  });

  // RF06/AC3: token com assinatura inválida retorna 401
  it('/ (GET) returns 401 for a token signed with a different secret', () => {
    const invalidToken = jwtService.sign(validPayload(), {
      secret: 'wrong-secret',
    });

    return request(app.getHttpServer())
      .get('/')
      .set('Authorization', `Bearer ${invalidToken}`)
      .expect(401);
  });

  // RF06/AC2: token expirado retorna 401
  it('/ (GET) returns 401 for an expired token', () => {
    const expiredToken = jwtService.sign(validPayload(), {
      expiresIn: '-10s',
    });

    return request(app.getHttpServer())
      .get('/')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });

  // RF01/RF02/AC4: token válido é aceito e a rota responde normalmente
  it('/ (GET) returns 200 for a valid token', () => {
    const token = jwtService.sign(validPayload());

    return request(app.getHttpServer())
      .get('/')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Hello World!');
  });
});
