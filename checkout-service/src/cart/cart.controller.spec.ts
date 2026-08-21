import { Request } from 'express';
import { CartController } from './cart.controller';
import { CartService, CartResponse } from './cart.service';

describe('CartController', () => {
  let cartService: {
    addItem: jest.Mock;
    getCart: jest.Mock;
    removeItem: jest.Mock;
  };
  let controller: CartController;

  const userId = 'user-1';
  const req = {
    user: { id: userId, email: 'jane@example.com', role: 'buyer' },
  } as Request & { user: { id: string; email: string; role: string } };

  const cartResponse: CartResponse = {
    id: 'cart-1',
    userId,
    status: 'active',
    items: [],
    total: 0,
  };

  beforeEach(() => {
    cartService = {
      addItem: jest.fn(),
      getCart: jest.fn(),
      removeItem: jest.fn(),
    };

    controller = new CartController(cartService as unknown as CartService);
  });

  describe('addItem', () => {
    it('delegates to CartService.addItem with the authenticated user id and the dto', async () => {
      cartService.addItem.mockResolvedValue(cartResponse);

      const result = await controller.addItem(
        { productId: 'product-1', quantity: 2 },
        req,
      );

      expect(cartService.addItem).toHaveBeenCalledWith(userId, {
        productId: 'product-1',
        quantity: 2,
      });
      expect(result).toBe(cartResponse);
    });

    it('propagates the exception thrown by CartService.addItem', async () => {
      const error = new Error('boom');
      cartService.addItem.mockRejectedValue(error);

      await expect(
        controller.addItem({ productId: 'product-1', quantity: 1 }, req),
      ).rejects.toThrow(error);
    });
  });

  describe('getCart', () => {
    it('delegates to CartService.getCart with the authenticated user id', async () => {
      cartService.getCart.mockResolvedValue(cartResponse);

      const result = await controller.getCart(req);

      expect(cartService.getCart).toHaveBeenCalledWith(userId);
      expect(result).toBe(cartResponse);
    });
  });

  describe('removeItem', () => {
    it('delegates to CartService.removeItem with the authenticated user id and the itemId param', async () => {
      cartService.removeItem.mockResolvedValue(cartResponse);

      const result = await controller.removeItem('item-1', req);

      expect(cartService.removeItem).toHaveBeenCalledWith(userId, 'item-1');
      expect(result).toBe(cartResponse);
    });

    it('propagates the exception thrown by CartService.removeItem', async () => {
      const error = new Error('not found');
      cartService.removeItem.mockRejectedValue(error);

      await expect(controller.removeItem('missing', req)).rejects.toThrow(
        error,
      );
    });
  });
});
