import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { User } from '../src/users/entities/user.entity';

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

interface ValidationErrorResponseBody {
  message: string[];
}

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
});
