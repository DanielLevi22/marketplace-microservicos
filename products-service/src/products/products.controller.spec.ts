import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';

type AuthenticatedRequestLike = Parameters<ProductsController['create']>[1];

type MockProductsService = {
  create: jest.Mock;
  findAllActive: jest.Mock;
  findBySeller: jest.Mock;
  findOne: jest.Mock;
};

describe('ProductsController', () => {
  let controller: ProductsController;
  let productsService: MockProductsService;

  const buildProduct = (overrides: Partial<Product> = {}): Product => ({
    id: 'product-uuid-1',
    name: 'Produto Teste',
    description: 'Descrição do produto de teste',
    price: 19.9,
    stock: 5,
    sellerId: 'seller-uuid-1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    productsService = {
      create: jest.fn(),
      findAllActive: jest.fn(),
      findBySeller: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: productsService }],
    }).compile();

    controller = module.get(ProductsController);
  });

  describe('create', () => {
    const dto: CreateProductDto = {
      name: 'Produto Teste',
      description: 'Descrição do produto de teste',
      price: 19.9,
      stock: 5,
    };

    it('delegates to productsService.create with the authenticated user id and role', async () => {
      const product = buildProduct();
      productsService.create.mockResolvedValue(product);

      const request = {
        user: { id: 'seller-uuid-1', email: 'seller@example.com', role: 'seller' },
      } as AuthenticatedRequestLike;

      const result = await controller.create(dto, request);

      expect(productsService.create).toHaveBeenCalledWith(
        dto,
        'seller-uuid-1',
        'seller',
      );
      expect(result).toBe(product);
    });

    it('propagates the error thrown by productsService.create for a non-seller role', async () => {
      const error = new Error('Apenas vendedores podem cadastrar produtos');
      productsService.create.mockRejectedValue(error);

      const request = {
        user: { id: 'buyer-uuid-1', email: 'buyer@example.com', role: 'buyer' },
      } as AuthenticatedRequestLike;

      await expect(controller.create(dto, request)).rejects.toThrow(error);
    });
  });

  describe('findAll', () => {
    it('delegates to productsService.findAllActive', async () => {
      const products = [buildProduct()];
      productsService.findAllActive.mockResolvedValue(products);

      const result = await controller.findAll();

      expect(productsService.findAllActive).toHaveBeenCalledWith();
      expect(result).toBe(products);
    });

    it('returns an empty list when there are no active products', async () => {
      productsService.findAllActive.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findBySeller', () => {
    it('delegates to productsService.findBySeller with the sellerId param', async () => {
      const products = [buildProduct({ sellerId: 'seller-uuid-1' })];
      productsService.findBySeller.mockResolvedValue(products);

      const result = await controller.findBySeller('seller-uuid-1');

      expect(productsService.findBySeller).toHaveBeenCalledWith(
        'seller-uuid-1',
      );
      expect(result).toBe(products);
    });

    it('returns an empty list when the seller has no products', async () => {
      productsService.findBySeller.mockResolvedValue([]);

      const result = await controller.findBySeller('seller-uuid-1');

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('delegates to productsService.findOne with the id param', async () => {
      const product = buildProduct();
      productsService.findOne.mockResolvedValue(product);

      const result = await controller.findOne(product.id);

      expect(productsService.findOne).toHaveBeenCalledWith(product.id);
      expect(result).toBe(product);
    });

    it('propagates the error thrown by productsService.findOne for a missing product', async () => {
      const error = new Error('Produto não encontrado');
      productsService.findOne.mockRejectedValue(error);

      await expect(controller.findOne('missing-id')).rejects.toThrow(error);
    });
  });
});
