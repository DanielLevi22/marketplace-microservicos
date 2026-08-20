import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ProductsController } from './products.controller';
import { ProxyService, type UserInfo } from 'src/proxy/service/proxy.service';
import { JwtAuthGuard } from 'src/guards/auth.guard';

describe('ProductsController', () => {
  let controller: ProductsController;
  let proxyService: { proxyRequest: jest.Mock };

  const user: UserInfo = {
    userId: 'uuid-1',
    email: 'seller@example.com',
    role: 'seller',
  };
  const authorization = 'Bearer some-token';

  beforeEach(async () => {
    proxyService = { proxyRequest: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProxyService, useValue: proxyService },
        JwtAuthGuard,
        Reflector,
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll proxies GET /products', async () => {
    await controller.findAll();

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'products',
      'get',
      '/products',
    );
  });

  it('findBySeller proxies GET /products/seller/:sellerId', async () => {
    await controller.findBySeller('uuid-seller');

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'products',
      'get',
      '/products/seller/uuid-seller',
    );
  });

  it('findOne proxies GET /products/:id', async () => {
    await controller.findOne('uuid-product');

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'products',
      'get',
      '/products/uuid-product',
    );
  });

  it('create proxies POST /products with the body, Authorization header and current user', async () => {
    const dto = { name: 'Produto', description: 'Desc', price: 9.9, stock: 1 };

    await controller.create(dto, authorization, user);

    expect(proxyService.proxyRequest).toHaveBeenCalledWith(
      'products',
      'post',
      '/products',
      dto,
      { Authorization: authorization },
      user,
    );
  });
});
