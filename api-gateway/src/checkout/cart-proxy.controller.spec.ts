import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { CartProxyController } from './cart-proxy.controller';
import { ProxyService, type UserInfo } from 'src/proxy/service/proxy.service';
import { JwtAuthGuard } from 'src/guards/auth.guard';

describe('CartProxyController', () => {
  let controller: CartProxyController;
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
      controllers: [CartProxyController],
      providers: [
        { provide: ProxyService, useValue: proxyService },
        JwtAuthGuard,
        Reflector,
      ],
    }).compile();

    controller = module.get<CartProxyController>(CartProxyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('addItem proxies POST /cart/items with the body, Authorization header and current user', async () => {
    const dto = { productId: 'uuid-product', quantity: 2 };

    await controller.addItem(dto, authorization, user);

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'checkout',
      'post',
      '/cart/items',
      dto,
      { Authorization: authorization },
      user,
    );
  });

  it('getCart proxies GET /cart with the Authorization header and current user', async () => {
    await controller.getCart(authorization, user);

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'checkout',
      'get',
      '/cart',
      undefined,
      { Authorization: authorization },
      user,
    );
  });

  it('removeItem proxies DELETE /cart/items/:itemId with the Authorization header and current user', async () => {
    await controller.removeItem('uuid-item', authorization, user);

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'checkout',
      'delete',
      '/cart/items/uuid-item',
      undefined,
      { Authorization: authorization },
      user,
    );
  });
});
