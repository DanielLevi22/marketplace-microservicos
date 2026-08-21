import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { OrdersProxyController } from './orders-proxy.controller';
import { ProxyService, type UserInfo } from 'src/proxy/service/proxy.service';
import { JwtAuthGuard } from 'src/guards/auth.guard';

describe('OrdersProxyController', () => {
  let controller: OrdersProxyController;
  let proxyService: { proxyRequest: jest.Mock };

  const user: UserInfo = {
    userId: 'uuid-1',
    email: 'buyer@example.com',
    role: 'buyer',
  };
  const authorization = 'Bearer some-token';

  beforeEach(async () => {
    proxyService = { proxyRequest: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersProxyController],
      providers: [
        { provide: ProxyService, useValue: proxyService },
        JwtAuthGuard,
        Reflector,
      ],
    }).compile();

    controller = module.get<OrdersProxyController>(OrdersProxyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('checkout proxies POST /cart/checkout with the body, Authorization header and current user', async () => {
    const dto = { paymentMethod: 'pix' };

    await controller.checkout(dto, authorization, user);

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'checkout',
      'post',
      '/cart/checkout',
      dto,
      { Authorization: authorization },
      user,
    );
  });

  it('findAll proxies GET /orders with the Authorization header and current user', async () => {
    await controller.findAll(authorization, user);

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'checkout',
      'get',
      '/orders',
      undefined,
      { Authorization: authorization },
      user,
    );
  });

  it('findOne proxies GET /orders/:id with the Authorization header and current user', async () => {
    await controller.findOne('uuid-order', authorization, user);

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'checkout',
      'get',
      '/orders/uuid-order',
      undefined,
      { Authorization: authorization },
      user,
    );
  });
});
