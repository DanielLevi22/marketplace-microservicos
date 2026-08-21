import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { CartService } from '../cart/cart.service';
import { PaymentQueueService } from '../events/payment-queue/payment-queue.service';
import { Cart } from '../cart/entities/cart.entity';

describe('OrdersService', () => {
  let ordersRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let cartService: {
    findActiveCartEntity: jest.Mock;
    completeCart: jest.Mock;
  };
  let paymentQueueService: { publishPaymentOrder: jest.Mock };
  let service: OrdersService;

  const userId = 'user-1';

  const activeCart: Partial<Cart> = {
    id: 'cart-1',
    userId,
    status: 'active',
    total: 59.8,
    items: [
      {
        id: 'item-1',
        cartId: 'cart-1',
        productId: 'product-1',
        productName: 'Mouse',
        price: 29.9,
        quantity: 2,
        subtotal: 59.8,
        createdAt: new Date('2026-01-01'),
      } as Cart['items'][number],
    ],
  };

  beforeEach(() => {
    ordersRepository = {
      create: jest.fn((data: Partial<Order>) => data),
      save: jest.fn((data: Partial<Order>) => ({
        id: 'order-1',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        ...data,
      })),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    cartService = {
      findActiveCartEntity: jest.fn(),
      completeCart: jest.fn(),
    };
    paymentQueueService = { publishPaymentOrder: jest.fn() };

    service = new OrdersService(
      ordersRepository as unknown as Repository<Order>,
      cartService as unknown as CartService,
      paymentQueueService as unknown as PaymentQueueService,
    );
  });

  describe('checkout', () => {
    it('rejects when the user has no active cart', async () => {
      cartService.findActiveCartEntity.mockResolvedValue(null);

      await expect(
        service.checkout(userId, { paymentMethod: 'pix' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ordersRepository.save).not.toHaveBeenCalled();
      expect(cartService.completeCart).not.toHaveBeenCalled();
      expect(paymentQueueService.publishPaymentOrder).not.toHaveBeenCalled();
    });

    it('rejects when the active cart has no items', async () => {
      cartService.findActiveCartEntity.mockResolvedValue({
        ...activeCart,
        items: [],
      });

      await expect(
        service.checkout(userId, { paymentMethod: 'pix' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ordersRepository.save).not.toHaveBeenCalled();
    });

    it('creates a pending order, completes the cart and publishes the payment message', async () => {
      cartService.findActiveCartEntity.mockResolvedValue(activeCart);

      const result = await service.checkout(userId, {
        paymentMethod: 'credit_card',
      });

      expect(ordersRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          cartId: 'cart-1',
          total: 59.8,
          paymentMethod: 'credit_card',
          status: 'pending',
        }),
      );
      expect(cartService.completeCart).toHaveBeenCalledWith('cart-1');
      expect(paymentQueueService.publishPaymentOrder).toHaveBeenCalledWith({
        orderId: 'order-1',
        userId,
        amount: 59.8,
        items: [{ productId: 'product-1', quantity: 2, price: 29.9 }],
        paymentMethod: 'credit_card',
      });
      expect(result).toMatchObject({
        id: 'order-1',
        userId,
        cartId: 'cart-1',
        total: 59.8,
        status: 'pending',
        paymentMethod: 'credit_card',
      });
    });

    it('propagates a failure from publishPaymentOrder instead of swallowing it', async () => {
      cartService.findActiveCartEntity.mockResolvedValue(activeCart);
      paymentQueueService.publishPaymentOrder.mockRejectedValue(
        new Error('RabbitMQ unavailable'),
      );

      await expect(
        service.checkout(userId, { paymentMethod: 'pix' }),
      ).rejects.toThrow('RabbitMQ unavailable');
    });
  });

  describe('findAllForUser', () => {
    it('returns the user orders ordered by createdAt desc', async () => {
      ordersRepository.find.mockResolvedValue([
        {
          id: 'order-2',
          userId,
          cartId: 'cart-2',
          total: 10,
          status: 'pending',
          paymentMethod: 'pix',
          createdAt: new Date('2026-01-02'),
          updatedAt: new Date('2026-01-02'),
        },
      ]);

      const result = await service.findAllForUser(userId);

      expect(ordersRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('order-2');
    });

    it('returns an empty list when the user has no orders', async () => {
      ordersRepository.find.mockResolvedValue([]);

      const result = await service.findAllForUser(userId);

      expect(result).toEqual([]);
    });
  });

  describe('findOneForUser', () => {
    it('throws NotFoundException when the order does not exist or belongs to another user', async () => {
      ordersRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findOneForUser(userId, 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(ordersRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'missing', userId },
      });
    });

    it('returns the order when it belongs to the user', async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: 'order-1',
        userId,
        cartId: 'cart-1',
        total: 59.8,
        status: 'pending',
        paymentMethod: 'pix',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      });

      const result = await service.findOneForUser(userId, 'order-1');

      expect(result.id).toBe('order-1');
    });
  });
});
