import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { PaymentsProxyController } from './payments-proxy.controller';
import { ProxyService, type UserInfo } from 'src/proxy/service/proxy.service';
import { JwtAuthGuard } from 'src/guards/auth.guard';

describe('PaymentsProxyController', () => {
  let controller: PaymentsProxyController;
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
      controllers: [PaymentsProxyController],
      providers: [
        { provide: ProxyService, useValue: proxyService },
        JwtAuthGuard,
        Reflector,
      ],
    }).compile();

    controller = module.get<PaymentsProxyController>(PaymentsProxyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findByOrderId proxies GET /payments/:orderId with the Authorization header and current user', async () => {
    const response = { orderId: 'uuid-order', status: 'approved' };
    proxyService.proxyRequest.mockResolvedValue(response);

    const result = await controller.findByOrderId(
      'uuid-order',
      authorization,
      user,
    );

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'payments',
      'get',
      '/payments/uuid-order',
      undefined,
      { Authorization: authorization },
      user,
    );
    expect(result).toBe(response);
  });
});
