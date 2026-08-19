import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';

type MockRepository = {
  findOne: jest.Mock;
  create: jest.Mock<User, [Partial<User>]>;
  save: jest.Mock;
};

describe('AuthService', () => {
  let service: AuthService;
  let repository: MockRepository;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: repository },
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
});
