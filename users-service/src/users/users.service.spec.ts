import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User, UserRole, UserStatus } from './entities/user.entity';

type MockRepository = {
  findOne: jest.Mock;
  find: jest.Mock;
};

describe('UsersService', () => {
  let service: UsersService;
  let repository: MockRepository;

  const buildUser = (overrides: Partial<User> = {}): User => ({
    id: 'uuid-1',
    email: 'jane@example.com',
    password: 'hashed-password',
    firstName: 'Jane',
    lastName: 'Doe',
    role: UserRole.BUYER,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repository },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('findById', () => {
    it('returns the user without the password when found', async () => {
      const user = buildUser();
      repository.findOne.mockResolvedValue(user);

      const result = await service.findById(user.id);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: user.id },
      });
      expect(result).toMatchObject({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      });
      expect(result).not.toHaveProperty('password');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findById('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findSellers', () => {
    it('queries only active sellers', async () => {
      repository.find.mockResolvedValue([]);

      await service.findSellers();

      expect(repository.find).toHaveBeenCalledWith({
        where: { role: UserRole.SELLER, status: UserStatus.ACTIVE },
      });
    });

    it('returns a list of sellers without the password field', async () => {
      const sellers = [
        buildUser({ id: 'uuid-1', role: UserRole.SELLER }),
        buildUser({ id: 'uuid-2', role: UserRole.SELLER }),
      ];
      repository.find.mockResolvedValue(sellers);

      const result = await service.findSellers();

      expect(result).toHaveLength(2);
      expect(result.every((seller) => !('password' in seller))).toBe(true);
    });

    it('returns an empty list when there are no active sellers', async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.findSellers();

      expect(result).toEqual([]);
    });
  });
});
