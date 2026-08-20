import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UsersController } from './users.controller';
import { ProxyService, type UserInfo } from 'src/proxy/service/proxy.service';
import { JwtAuthGuard } from 'src/guards/auth.guard';

describe('UsersController', () => {
  let controller: UsersController;
  let proxyService: { proxyRequest: jest.Mock };

  const user: UserInfo = {
    userId: 'uuid-1',
    email: 'jane@example.com',
    role: 'buyer',
  };
  const authorization = 'Bearer some-token';

  beforeEach(async () => {
    proxyService = { proxyRequest: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: ProxyService, useValue: proxyService },
        JwtAuthGuard,
        Reflector,
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getProfile proxies GET /users/profile with the Authorization header and current user', async () => {
    await controller.getProfile(authorization, user);

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'users',
      'get',
      '/users/profile',
      undefined,
      { Authorization: authorization },
      user,
    );
  });

  it('getSellers proxies GET /users/sellers with the Authorization header and current user', async () => {
    await controller.getSellers(authorization, user);

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'users',
      'get',
      '/users/sellers',
      undefined,
      { Authorization: authorization },
      user,
    );
  });

  it('getById proxies GET /users/:id with the Authorization header and current user', async () => {
    await controller.getById('uuid-2', authorization, user);

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'users',
      'get',
      '/users/uuid-2',
      undefined,
      { Authorization: authorization },
      user,
    );
  });
});
