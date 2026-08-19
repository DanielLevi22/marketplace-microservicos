import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';

type MockRepository = {
  findOne: jest.Mock;
  create: jest.Mock<User, [Partial<User>]>;
  save: jest.Mock;
};

describe('AuthService', () => {
  let service: AuthService;
  let repository: MockRepository;
  let jwtService: { sign: jest.Mock };

  const dto: RegisterDto = {
    email: 'jane@example.com',
    password: 'secret123',
    firstName: 'Jane',
    lastName: 'Doe',
    role: UserRole.BUYER,
  };

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      create: jest.fn<User, [Partial<User>]>(),
      save: jest.fn(),
    };
    jwtService = { sign: jest.fn().mockReturnValue('mocked-jwt') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('hashes the password before persisting it', async () => {
    repository.findOne.mockResolvedValue(null);
    repository.create.mockImplementation((data) => data as User);
    repository.save.mockImplementation((user) => ({
      ...(user as User),
      id: 'uuid-1',
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await service.register(dto);

    const createArg = repository.create.mock.calls[0][0];
    expect(createArg.password).toBeDefined();
    expect(createArg.password).not.toBe(dto.password);
  });

  it('forces status to active and never returns the password', async () => {
    repository.findOne.mockResolvedValue(null);
    repository.create.mockImplementation((data) => data as User);
    repository.save.mockImplementation((user) => ({
      ...(user as User),
      id: 'uuid-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await service.register(dto);

    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(result).not.toHaveProperty('password');
  });

  it('throws ConflictException and never saves when the email already exists', async () => {
    repository.findOne.mockResolvedValue({ id: 'existing' });

    await expect(service.register(dto)).rejects.toThrow(ConflictException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'jane@example.com',
      password: 'secret123',
    };

    const buildUser = (overrides: Partial<User> = {}): User =>
      ({
        id: 'uuid-1',
        email: loginDto.email,
        firstName: 'Jane',
        lastName: 'Doe',
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      }) as User;

    it('returns the user (without password) and a signed token for correct credentials on an active account', async () => {
      const user = buildUser({
        password: await bcrypt.hash(loginDto.password, 10),
      });
      repository.findOne.mockResolvedValue(user);

      const result = await service.login(loginDto);

      expect(result.token).toBe('mocked-jwt');
      expect(result.user).not.toHaveProperty('password');
      expect(result.user).toMatchObject({
        id: user.id,
        email: user.email,
        role: user.role,
        status: UserStatus.ACTIVE,
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        role: user.role,
      });
    });

    it('throws UnauthorizedException("Credenciais inválidas") when the email does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Credenciais inválidas'),
      );
    });

    it('throws UnauthorizedException("Credenciais inválidas") when the password is wrong', async () => {
      const user = buildUser({ password: await bcrypt.hash('other-pass', 10) });
      repository.findOne.mockResolvedValue(user);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Credenciais inválidas'),
      );
    });

    it('throws UnauthorizedException("Conta inativa") when credentials are correct but the account is not active', async () => {
      const user = buildUser({
        password: await bcrypt.hash(loginDto.password, 10),
        status: UserStatus.INACTIVE,
      });
      repository.findOne.mockResolvedValue(user);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Conta inativa'),
      );
    });
  });
});
