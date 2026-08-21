import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';

type MockRepository = {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
};

describe('ProductsService', () => {
  let service: ProductsService;
  let repository: MockRepository;

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
    repository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: repository },
      ],
    }).compile();

    service = module.get(ProductsService);
  });

  describe('create', () => {
    const dto: CreateProductDto = {
      name: 'Produto Teste',
      description: 'Descrição do produto de teste',
      price: 19.9,
      stock: 5,
    };
    const sellerId = 'seller-uuid-1';

    it('rejects with ForbiddenException when role is not seller', () => {
      expect(() => service.create(dto, sellerId, 'buyer')).toThrow(
        ForbiddenException,
      );

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('creates the product with isActive forced to true when role is seller', async () => {
      const created = buildProduct({ sellerId, isActive: true });
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(created);

      const result = await service.create(dto, sellerId, 'seller');

      expect(repository.create).toHaveBeenCalledWith({
        ...dto,
        sellerId,
        isActive: true,
      });
      expect(repository.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });

    it('forces isActive to true even if the payload tries to send another value', async () => {
      const dtoWithIsActive = { ...dto, isActive: false } as CreateProductDto;
      const created = buildProduct({ sellerId, isActive: true });
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(created);

      await service.create(dtoWithIsActive, sellerId, 'seller');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });
  });

  describe('findAllActive', () => {
    it('queries only active products ordered by createdAt desc', async () => {
      repository.find.mockResolvedValue([]);

      await service.findAllActive();

      expect(repository.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { createdAt: 'DESC' },
      });
    });

    it('returns the active products found', async () => {
      const products = [buildProduct(), buildProduct({ id: 'product-uuid-2' })];
      repository.find.mockResolvedValue(products);

      const result = await service.findAllActive();

      expect(result).toEqual(products);
    });
  });

  describe('findBySeller', () => {
    it('queries only active products of the given seller', async () => {
      repository.find.mockResolvedValue([]);

      await service.findBySeller('seller-uuid-1');

      expect(repository.find).toHaveBeenCalledWith({
        where: { isActive: true, sellerId: 'seller-uuid-1' },
      });
    });

    it('returns the products found for the seller', async () => {
      const products = [buildProduct({ sellerId: 'seller-uuid-1' })];
      repository.find.mockResolvedValue(products);

      const result = await service.findBySeller('seller-uuid-1');

      expect(result).toEqual(products);
    });

    it('returns an empty list when the seller has no active products', async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.findBySeller('seller-uuid-1');

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns the product when found', async () => {
      const product = buildProduct();
      repository.findOne.mockResolvedValue(product);

      const result = await service.findOne(product.id);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: product.id },
      });
      expect(result).toEqual(product);
    });

    it('throws NotFoundException when the product does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
