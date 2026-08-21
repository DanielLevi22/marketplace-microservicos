import { Request } from 'express';
import { OrdersController } from './orders.controller';
import { OrdersService, OrderResponse } from './orders.service';

describe('OrdersController', () => {
  let ordersService: {
    checkout: jest.Mock;
    findAllForUser: jest.Mock;
    findOneForUser: jest.Mock;
  };
  let controller: OrdersController;

  const userId = 'user-1';
  const req = {
    user: { id: userId, email: 'jane@example.com', role: 'buyer' },
  } as Request & { user: { id: string; email: string; role: string } };

  const orderResponse: OrderResponse = {
    id: 'order-1',
    userId,
    cartId: 'cart-1',
    total: 59.8,
    status: 'pending',
    paymentMethod: 'pix',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    ordersService = {
      checkout: jest.fn(),
      findAllForUser: jest.fn(),
      findOneForUser: jest.fn(),
    };

    controller = new OrdersController(
      ordersService as unknown as OrdersService,
    );
  });

  describe('checkout', () => {
    it('delegates to OrdersService.checkout with the authenticated user id and the dto', async () => {
      ordersService.checkout.mockResolvedValue(orderResponse);

      const result = await controller.checkout({ paymentMethod: 'pix' }, req);

      expect(ordersService.checkout).toHaveBeenCalledWith(userId, {
        paymentMethod: 'pix',
      });
      expect(result).toBe(orderResponse);
    });

    it('propagates the exception thrown by OrdersService.checkout', async () => {
      const error = new Error('empty cart');
      ordersService.checkout.mockRejectedValue(error);

      await expect(
        controller.checkout({ paymentMethod: 'pix' }, req),
      ).rejects.toThrow(error);
    });
  });

  describe('findAll', () => {
    it('delegates to OrdersService.findAllForUser with the authenticated user id', async () => {
      ordersService.findAllForUser.mockResolvedValue([orderResponse]);

      const result = await controller.findAll(req);

      expect(ordersService.findAllForUser).toHaveBeenCalledWith(userId);
      expect(result).toEqual([orderResponse]);
    });
  });

  describe('findOne', () => {
    it('delegates to OrdersService.findOneForUser with the authenticated user id and the id param', async () => {
      ordersService.findOneForUser.mockResolvedValue(orderResponse);

      const result = await controller.findOne('order-1', req);

      expect(ordersService.findOneForUser).toHaveBeenCalledWith(
        userId,
        'order-1',
      );
      expect(result).toBe(orderResponse);
    });

    it('propagates the exception thrown by OrdersService.findOneForUser', async () => {
      const error = new Error('not found');
      ordersService.findOneForUser.mockRejectedValue(error);

      await expect(controller.findOne('missing', req)).rejects.toThrow(
        error,
      );
    });
  });
});
