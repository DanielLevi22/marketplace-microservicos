import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserRole, UserStatus } from './entities/user.entity';

type AuthenticatedRequestLike = Parameters<UsersController['getProfile']>[0];

type MockUsersService = {
  findById: jest.Mock;
  findSellers: jest.Mock;
};

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: MockUsersService;

  const userResponse = {
    id: 'uuid-1',
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    role: UserRole.BUYER,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    usersService = {
      findById: jest.fn(),
      findSellers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get(UsersController);
  });

  describe('getProfile', () => {
    it('delegates to usersService.findById with the authenticated user id', async () => {
      usersService.findById.mockResolvedValue(userResponse);

      const request = {
        user: {
          id: userResponse.id,
          email: userResponse.email,
          role: userResponse.role,
        },
      } as AuthenticatedRequestLike;

      const result = await controller.getProfile(request);

      expect(usersService.findById).toHaveBeenCalledWith(userResponse.id);
      expect(result).toBe(userResponse);
    });
  });

  describe('getSellers', () => {
    it('delegates to usersService.findSellers', async () => {
      const sellers = [userResponse];
      usersService.findSellers.mockResolvedValue(sellers);

      const result = await controller.getSellers();

      expect(usersService.findSellers).toHaveBeenCalledWith();
      expect(result).toBe(sellers);
    });

    it('returns an empty list when there are no sellers', async () => {
      usersService.findSellers.mockResolvedValue([]);

      const result = await controller.getSellers();

      expect(result).toEqual([]);
    });
  });

  describe('getById', () => {
    it('delegates to usersService.findById with the id param', async () => {
      usersService.findById.mockResolvedValue(userResponse);

      const result = await controller.getById(userResponse.id);

      expect(usersService.findById).toHaveBeenCalledWith(userResponse.id);
      expect(result).toBe(userResponse);
    });

    it('propagates the error thrown by usersService.findById for a missing user', async () => {
      const error = new Error('Usuário não encontrado');
      usersService.findById.mockRejectedValue(error);

      await expect(controller.getById('missing-id')).rejects.toThrow(error);
    });
  });
});
