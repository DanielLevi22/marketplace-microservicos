import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { Public } from '../src/auth/decorators/public.decorator';

const JWT_SECRET = 'e2e-test-secret';

@Controller()
class TestController {
  @Get('protected')
  getProtected(@Req() req: { user: unknown }) {
    return req.user;
  }

  @Public()
  @Get('public')
  getPublic() {
    return { ok: true };
  }
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  beforeAll(async () => {
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = JWT_SECRET;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [TestController],
      providers: [JwtStrategy, { provide: APP_GUARD, useClass: JwtAuthGuard }],
    }).compile();

    process.env.JWT_SECRET = originalSecret;

    app = moduleFixture.createNestApplication();
    await app.init();
    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const payload = { sub: 'uuid-1', email: 'jane@example.com', role: 'buyer' };

  it('returns 401 for a protected route without a token', () => {
    return request(app.getHttpServer()).get('/protected').expect(401);
  });

  it('returns 401 for a protected route with an invalid signature', () => {
    const tokenWithWrongSecret = jwtService.sign(payload, {
      secret: 'wrong-secret',
    });

    return request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${tokenWithWrongSecret}`)
      .expect(401);
  });

  it('returns 401 for a protected route with an expired token', () => {
    const expiredToken = jwtService.sign(payload, { expiresIn: '-1s' });

    return request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });

  it('returns 200 and req.user for a protected route with a valid token', () => {
    const token = jwtService.sign(payload);

    return request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ id: payload.sub, email: payload.email, role: payload.role });
  });

  it('returns 200 for a @Public() route without a token', () => {
    return request(app.getHttpServer())
      .get('/public')
      .expect(200)
      .expect({ ok: true });
  });
});
