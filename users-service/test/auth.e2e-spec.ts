import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { User, UserStatus } from '../src/users/entities/user.entity';

interface RegisterResponseBody {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface LoginResponseBody {
  user: RegisterResponseBody;
  token: string;
}

interface ValidationErrorResponseBody {
  message: string[];
}

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

const decodeJwtPayload = (token: string): JwtPayload => {
  const payload = token.split('.')[1];
  return JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as JwtPayload;
};

// Spec 04-guards-protecao-rotas-jwt.md RF07/AC5: nenhuma requisição abaixo
// envia header Authorization, e os testes de register/login continuam
// esperando sucesso — comprova que essas rotas seguem públicas mesmo com o
// JwtAuthGuard global ativo (ver test/app.e2e-spec.ts para os testes do guard).
describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let userRepository: Repository<User>;
  const createdEmails: string[] = [];

  const uniqueEmail = () => {
    const email = `e2e-${randomUUID()}@test.com`;
    createdEmails.push(email);
    return email;
  };

  const validPayload = () => ({
    email: uniqueEmail(),
    password: 'secret123',
    firstName: 'Jane',
    lastName: 'Doe',
    role: 'buyer',
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    userRepository = app.get(getRepositoryToken(User));
  });

  afterEach(async () => {
    if (createdEmails.length) {
      await userRepository.delete({ email: createdEmails });
      createdEmails.length = 0;
    }
    await app.close();
  });

  // AC1: cadastro com payload válido
  it.each(['buyer', 'seller'])(
    '/auth/register (POST) creates a %s user and never returns the password',
    async (role) => {
      const payload = { ...validPayload(), role };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(201);

      const body = response.body as RegisterResponseBody;
      expect(body).toMatchObject({
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        role,
        status: 'active',
      });
      expect(body).not.toHaveProperty('password');
      expect(body.id).toBeDefined();
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    },
  );

  // AC2: senha persistida como hash bcrypt, nunca em texto plano
  it('persists the password as a bcrypt hash, not plaintext', async () => {
    const payload = validPayload();

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(payload)
      .expect(201);

    const saved = await userRepository.findOne({
      where: { email: payload.email },
    });

    expect(saved).not.toBeNull();
    expect(saved!.password).not.toBe(payload.password);
    expect(await bcrypt.compare(payload.password, saved!.password)).toBe(true);
  });

  // AC3: email duplicado retorna 409 e não cria novo registro
  it('/auth/register (POST) returns 409 for a duplicate email', async () => {
    const payload = validPayload();

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(payload)
      .expect(409);

    const count = await userRepository.count({
      where: { email: payload.email },
    });
    expect(count).toBe(1);
  });

  // AC4: dados inválidos retornam 400 e não criam registro
  const invalidCases: Array<[string, Record<string, unknown>]> = [
    ['missing email', { email: undefined }],
    ['malformed email', { email: 'not-an-email' }],
    ['password shorter than 6 chars', { password: '123' }],
    ['missing firstName', { firstName: undefined }],
    ['firstName longer than 100 chars', { firstName: 'a'.repeat(101) }],
    ['missing lastName', { lastName: undefined }],
    ['lastName longer than 100 chars', { lastName: 'a'.repeat(101) }],
    ['missing role', { role: undefined }],
    ['role outside seller/buyer', { role: 'admin' }],
  ];

  it.each(invalidCases)(
    '/auth/register (POST) returns 400 for %s',
    async (_description, overrides) => {
      const payload = { ...validPayload(), ...overrides };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(400);

      const body = response.body as ValidationErrorResponseBody;
      expect(Array.isArray(body.message)).toBe(true);
      expect(body.message.length).toBeGreaterThan(0);
    },
  );

  // AC5: campo extra não declarado é rejeitado
  it('/auth/register (POST) returns 400 when an undeclared field is sent', async () => {
    const payload = { ...validPayload(), status: 'active' };

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(payload)
      .expect(400);

    const count = await userRepository.count({
      where: { email: payload.email },
    });
    expect(count).toBe(0);
  });

  // AC6: AuthModule reaproveita o repositório User já registrado em UsersModule
  // (verificado estruturalmente — único TypeOrmModule.forFeature([User]) no
  // projeto, ver users-service/src/users/users.module.ts — não é testável via HTTP)

  describe('/auth/login (POST)', () => {
    const registerUser = async () => {
      const payload = validPayload();
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(201);
      return payload;
    };

    // Login AC1/AC2: credenciais corretas retornam user (sem password) + token
    // com sub/email/role corretos e expiração de ~24h
    it('returns the user and a valid JWT for correct credentials', async () => {
      const payload = await registerUser();

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(200);

      const body = response.body as LoginResponseBody;
      expect(body.user).toMatchObject({
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        role: payload.role,
        status: 'active',
      });
      expect(body.user).not.toHaveProperty('password');
      expect(body.token).toBeDefined();

      const decoded = decodeJwtPayload(body.token);
      expect(decoded.sub).toBe(body.user.id);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);

      const expiresInSeconds = decoded.exp - decoded.iat;
      expect(expiresInSeconds).toBe(24 * 60 * 60);
    });

    // Login AC3: email não cadastrado retorna 401 com mensagem genérica
    it('returns 401 "Credenciais inválidas" for an email that does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: uniqueEmail(), password: 'secret123' })
        .expect(401);

      expect(response.body).toMatchObject({ message: 'Credenciais inválidas' });
    });

    // Login AC4: senha incorreta retorna 401 com a mesma mensagem genérica
    it('returns 401 "Credenciais inválidas" for a wrong password', async () => {
      const payload = await registerUser();

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: 'wrong-password' })
        .expect(401);

      expect(response.body).toMatchObject({ message: 'Credenciais inválidas' });
    });

    // Login AC5: credenciais corretas mas conta inativa retorna 401 "Conta inativa"
    it('returns 401 "Conta inativa" when the account status is not active', async () => {
      const payload = await registerUser();
      await userRepository.update(
        { email: payload.email },
        { status: UserStatus.INACTIVE },
      );

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(401);

      expect(response.body).toMatchObject({ message: 'Conta inativa' });
    });

    // Login AC6: payload inválido retorna 400 e nenhuma autenticação é tentada
    const invalidLoginCases: Array<[string, Record<string, unknown>]> = [
      ['missing email', { email: undefined }],
      ['malformed email', { email: 'not-an-email' }],
      ['missing password', { password: undefined }],
      ['password shorter than 6 chars', { password: '123' }],
    ];

    it.each(invalidLoginCases)(
      '/auth/login (POST) returns 400 for %s',
      async (_description, overrides) => {
        const payload = {
          email: uniqueEmail(),
          password: 'secret123',
          ...overrides,
        };

        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send(payload)
          .expect(400);

        const body = response.body as ValidationErrorResponseBody;
        expect(Array.isArray(body.message)).toBe(true);
        expect(body.message.length).toBeGreaterThan(0);
      },
    );

    it('/auth/login (POST) returns 400 when an undeclared field is sent', async () => {
      const payload = await registerUser();

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: payload.email,
          password: payload.password,
          remember: true,
        })
        .expect(400);
    });

    // Login AC7: em nenhuma resposta (sucesso ou erro) o password é exposto
    it('never exposes the password field in any login response', async () => {
      const payload = await registerUser();

      const success = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(200);
      expect(JSON.stringify(success.body)).not.toContain(payload.password);

      const failure = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: 'wrong-password' })
        .expect(401);
      expect(failure.body).not.toHaveProperty('password');
    });
  });

  // Spec 06-integracao-api-gateway.md RF01: endpoint usado internamente pelo
  // api-gateway para validar um token e obter userId/email/role.
  describe('/auth/validate-token (GET)', () => {
    const registerAndLogin = async () => {
      const payload = validPayload();
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(200);

      const body = loginResponse.body as LoginResponseBody;
      return { payload, user: body.user, token: body.token };
    };

    it('returns 401 without an Authorization header', () => {
      return request(app.getHttpServer())
        .get('/auth/validate-token')
        .expect(401);
    });

    it('returns userId, email and role for a valid token', async () => {
      const { user, token } = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .get('/auth/validate-token')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({
        userId: user.id,
        email: user.email,
        role: user.role,
      });
    });
  });
});
