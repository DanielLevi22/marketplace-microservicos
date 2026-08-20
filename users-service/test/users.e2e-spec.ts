import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';

interface UserResponseBody {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// Spec 05-consulta-usuarios.md: GET /users/profile, GET /users/sellers e
// GET /users/:id, todos protegidos pelo JwtAuthGuard global e nunca
// expondo o campo password.
describe('UsersController (e2e)', () => {
  let app: INestApplication<App>;
  let userRepository: Repository<User>;
  const createdEmails: string[] = [];

  const uniqueEmail = () => {
    const email = `e2e-users-${randomUUID()}@test.com`;
    createdEmails.push(email);
    return email;
  };

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

  const registerAndLogin = async (role: UserRole = UserRole.BUYER) => {
    const payload = {
      email: uniqueEmail(),
      password: 'secret123',
      firstName: 'Jane',
      lastName: 'Doe',
      role,
    };

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(payload)
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: payload.email, password: payload.password })
      .expect(200);

    const body = loginResponse.body as {
      user: UserResponseBody;
      token: string;
    };

    return { payload, user: body.user, token: body.token };
  };

  describe('GET /users/profile', () => {
    // AC1: sem token, retorna 401
    it('returns 401 without an Authorization header', () => {
      return request(app.getHttpServer()).get('/users/profile').expect(401);
    });

    // AC2: token válido retorna os dados do usuário logado, sem password
    it('returns the authenticated user data without the password', async () => {
      const { user, token } = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as UserResponseBody;
      expect(body).toMatchObject({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      });
      expect(body).not.toHaveProperty('password');
    });

    // RF01: busca dados atualizados no banco, não os do payload do token
    it('returns up-to-date data from the database, not the token payload', async () => {
      const { user, token } = await registerAndLogin();

      await userRepository.update({ id: user.id }, { firstName: 'Updated' });

      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as UserResponseBody;
      expect(body.firstName).toBe('Updated');
    });

    // AC8: /users/profile é tratado pela rota estática, não por :id
    it('is handled by the static route, not the :id route', async () => {
      const { token } = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect((response.body as UserResponseBody).id).toBeDefined();
    });
  });

  describe('GET /users/sellers', () => {
    // AC3: sem token, retorna 401
    it('returns 401 without an Authorization header', () => {
      return request(app.getHttpServer()).get('/users/sellers').expect(401);
    });

    // AC4: apenas usuários com role=seller e status=active aparecem
    it('returns only active sellers, excluding buyers', async () => {
      const seller = await registerAndLogin(UserRole.SELLER);
      const buyer = await registerAndLogin(UserRole.BUYER);

      const response = await request(app.getHttpServer())
        .get('/users/sellers')
        .set('Authorization', `Bearer ${buyer.token}`)
        .expect(200);

      const body = response.body as UserResponseBody[];
      const ids = body.map((u) => u.id);
      expect(ids).toContain(seller.user.id);
      expect(ids).not.toContain(buyer.user.id);
      expect(body.every((u) => !('password' in u))).toBe(true);
    });

    // RF02: seller inativo não aparece na listagem
    it('excludes inactive sellers', async () => {
      const inactiveSeller = await registerAndLogin(UserRole.SELLER);
      await userRepository.update(
        { id: inactiveSeller.user.id },
        { status: UserStatus.INACTIVE },
      );
      const activeSeller = await registerAndLogin(UserRole.SELLER);

      const response = await request(app.getHttpServer())
        .get('/users/sellers')
        .set('Authorization', `Bearer ${activeSeller.token}`)
        .expect(200);

      const ids = (response.body as UserResponseBody[]).map((u) => u.id);
      expect(ids).not.toContain(inactiveSeller.user.id);
      expect(ids).toContain(activeSeller.user.id);
    });

    // AC8: /users/sellers é tratado pela rota estática, não por :id
    it('is handled by the static route, not the :id route', async () => {
      const { token } = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .get('/users/sellers')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /users/:id', () => {
    // AC5: sem token, retorna 401
    it('returns 401 without an Authorization header', () => {
      return request(app.getHttpServer())
        .get(`/users/${randomUUID()}`)
        .expect(401);
    });

    // AC6: retorna os dados corretos para um id existente, sem password
    it('returns the user data for an existing id', async () => {
      const { user, token } = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as UserResponseBody;
      expect(body).toMatchObject({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      });
      expect(body).not.toHaveProperty('password');
    });

    // AC7: id inexistente retorna 404
    it('returns 404 for a non-existent id', async () => {
      const { token } = await registerAndLogin();

      await request(app.getHttpServer())
        .get(`/users/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
