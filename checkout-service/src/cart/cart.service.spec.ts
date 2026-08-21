import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CartService } from './cart.service';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import {
  ProductsClientService,
  ProductResponse,
} from './products-client.service';

describe('CartService', () => {
  let cartRepository: {
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let cartItemRepository: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let productsClientService: { findById: jest.Mock };
  let service: CartService;

  const userId = 'user-1';

  const product: ProductResponse = {
    id: 'product-1',
    name: 'Mouse',
    price: 29.9,
    stock: 10,
    isActive: true,
    sellerId: 'seller-1',
  };

  beforeEach(() => {
    cartRepository = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      create: jest.fn((data: Partial<Cart>) => data),
      save: jest.fn((data: Partial<Cart>) => ({ id: 'cart-1', ...data })),
      update: jest.fn(),
    };
    cartItemRepository = {
      create: jest.fn((data: Partial<CartItem>) => data),
      save: jest.fn((data: Partial<CartItem>) => ({ id: 'item-1', ...data })),
      update: jest.fn(),
      delete: jest.fn(),
    };
    productsClientService = { findById: jest.fn() };

    service = new CartService(
      cartRepository as unknown as Repository<Cart>,
      cartItemRepository as unknown as Repository<CartItem>,
      productsClientService as unknown as ProductsClientService,
    );
  });

  describe('addItem', () => {
    it('propagates the exception thrown by ProductsClientService', async () => {
      productsClientService.findById.mockRejectedValue(
        new NotFoundException('Produto não encontrado'),
      );

      await expect(
        service.addItem(userId, { productId: 'missing', quantity: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(cartRepository.findOne).not.toHaveBeenCalled();
    });

    it('rejects an inactive product without touching the repositories', async () => {
      productsClientService.findById.mockResolvedValue({
        ...product,
        isActive: false,
      });

      await expect(
        service.addItem(userId, { productId: product.id, quantity: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(cartRepository.findOne).not.toHaveBeenCalled();
      expect(cartItemRepository.save).not.toHaveBeenCalled();
    });

    it('creates a cart and a snapshot item when the user has no active cart', async () => {
      productsClientService.findById.mockResolvedValue(product);
      cartRepository.findOne.mockResolvedValue(null);
      cartRepository.findOneOrFail.mockResolvedValue({
        id: 'cart-1',
        userId,
        status: 'active',
        items: [
          {
            id: 'item-1',
            productId: product.id,
            productName: product.name,
            price: product.price,
            quantity: 2,
            subtotal: 59.8,
          },
        ],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      });

      const result = await service.addItem(userId, {
        productId: product.id,
        quantity: 2,
      });

      expect(cartRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId, status: 'active', total: 0 }),
      );
      expect(cartItemRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          cartId: 'cart-1',
          productId: product.id,
          productName: product.name,
          price: 29.9,
          quantity: 2,
          subtotal: 59.8,
        }),
      );
      expect(result.total).toBe(59.8);
      expect(result.items).toHaveLength(1);
    });

    it('sums the quantity and recalculates subtotal from the stored price when the product is already in the cart', async () => {
      productsClientService.findById.mockResolvedValue({
        ...product,
        price: 999,
      });
      const existingItem = {
        id: 'item-1',
        productId: product.id,
        productName: product.name,
        price: 29.9,
        quantity: 1,
        subtotal: 29.9,
      };
      cartRepository.findOne.mockResolvedValue({
        id: 'cart-1',
        userId,
        status: 'active',
        items: [existingItem],
      });
      cartRepository.findOneOrFail.mockResolvedValue({
        id: 'cart-1',
        userId,
        status: 'active',
        items: [{ ...existingItem, quantity: 3, subtotal: 89.7 }],
      });

      await service.addItem(userId, { productId: product.id, quantity: 2 });

      expect(cartItemRepository.update).toHaveBeenCalledWith('item-1', {
        quantity: 3,
        subtotal: expect.closeTo(89.7, 5) as number,
      });
      expect(cartItemRepository.save).not.toHaveBeenCalled();
    });

    it('returns a total equal to the sum of item subtotals', async () => {
      productsClientService.findById.mockResolvedValue(product);
      cartRepository.findOne.mockResolvedValue({
        id: 'cart-1',
        userId,
        status: 'active',
        items: [],
      });
      cartRepository.findOneOrFail.mockResolvedValue({
        id: 'cart-1',
        userId,
        status: 'active',
        items: [
          {
            id: 'a',
            productId: 'p1',
            productName: 'A',
            price: 10,
            quantity: 1,
            subtotal: 10,
          },
          {
            id: 'b',
            productId: 'p2',
            productName: 'B',
            price: 20,
            quantity: 2,
            subtotal: 40,
          },
        ],
      });

      const result = await service.addItem(userId, {
        productId: product.id,
        quantity: 1,
      });

      expect(result.total).toBe(50);
      expect(cartRepository.update).toHaveBeenCalledWith('cart-1', {
        total: 50,
      });
    });
  });

  describe('getCart', () => {
    it('returns an empty cart shape without creating a row when there is no active cart', async () => {
      cartRepository.findOne.mockResolvedValue(null);

      const result = await service.getCart(userId);

      expect(result).toEqual({
        userId,
        status: 'active',
        items: [],
        total: 0,
      });
      expect(cartRepository.create).not.toHaveBeenCalled();
      expect(cartRepository.save).not.toHaveBeenCalled();
    });

    it('returns the items and total of an existing active cart', async () => {
      cartRepository.findOne.mockResolvedValue({ id: 'cart-1', userId });
      cartRepository.findOneOrFail.mockResolvedValue({
        id: 'cart-1',
        userId,
        status: 'active',
        items: [
          {
            id: 'a',
            productId: 'p1',
            productName: 'A',
            price: 10,
            quantity: 2,
            subtotal: 20,
          },
        ],
      });

      const result = await service.getCart(userId);

      expect(result.total).toBe(20);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('removeItem', () => {
    it('throws NotFoundException when the user has no active cart', async () => {
      cartRepository.findOne.mockResolvedValue(null);

      await expect(service.removeItem(userId, 'item-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(cartItemRepository.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the item does not belong to the user active cart', async () => {
      cartRepository.findOne.mockResolvedValue({
        id: 'cart-1',
        userId,
        status: 'active',
        items: [{ id: 'other-item', productId: 'p1' }],
      });

      await expect(service.removeItem(userId, 'item-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(cartItemRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes the item and returns the total recalculated from remaining items', async () => {
      cartRepository.findOne.mockResolvedValue({
        id: 'cart-1',
        userId,
        status: 'active',
        items: [
          { id: 'item-1', productId: 'p1' },
          { id: 'item-2', productId: 'p2' },
        ],
      });
      cartRepository.findOneOrFail.mockResolvedValue({
        id: 'cart-1',
        userId,
        status: 'active',
        items: [
          {
            id: 'item-2',
            productId: 'p2',
            productName: 'B',
            price: 20,
            quantity: 1,
            subtotal: 20,
          },
        ],
      });

      const result = await service.removeItem(userId, 'item-1');

      expect(cartItemRepository.delete).toHaveBeenCalledWith('item-1');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(20);
    });
  });
});
