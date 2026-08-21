import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { CartService } from '../cart/cart.service';
import { PaymentQueueService } from '../events/payment-queue/payment-queue.service';
import { CheckoutDto, PaymentMethod } from './dto/checkout.dto';

export interface OrderResponse {
  id: string;
  userId: string;
  cartId: string;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly cartService: CartService,
    private readonly paymentQueueService: PaymentQueueService,
  ) {}

  async checkout(userId: string, dto: CheckoutDto): Promise<OrderResponse> {
    const cart = await this.cartService.findActiveCartEntity(userId);

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException(
        'Carrinho vazio ou inexistente não pode ser finalizado',
      );
    }

    const total = Number(cart.total);

    const order = await this.ordersRepository.save(
      this.ordersRepository.create({
        userId,
        cartId: cart.id,
        total,
        paymentMethod: dto.paymentMethod,
        status: 'pending',
      }),
    );

    await this.cartService.completeCart(cart.id);

    await this.paymentQueueService.publishPaymentOrder({
      orderId: order.id,
      userId,
      amount: total,
      items: cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: Number(item.price),
      })),
      paymentMethod: dto.paymentMethod,
    });

    return this.toResponse(order);
  }

  async findAllForUser(userId: string): Promise<OrderResponse[]> {
    const orders = await this.ordersRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return orders.map((order) => this.toResponse(order));
  }

  async findOneForUser(userId: string, id: string): Promise<OrderResponse> {
    const order = await this.ordersRepository.findOne({
      where: { id, userId },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return this.toResponse(order);
  }

  private toResponse(order: Order): OrderResponse {
    return {
      id: order.id,
      userId: order.userId,
      cartId: order.cartId,
      total: Number(order.total),
      status: order.status,
      paymentMethod: order.paymentMethod as PaymentMethod,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
