import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { ProductsClientService } from './products-client.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';

export interface CartItemResponse {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface CartResponse {
  id?: string;
  userId: string;
  status: string;
  items: CartItemResponse[];
  total: number;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    private readonly productsClientService: ProductsClientService,
  ) {}

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartResponse> {
    const product = await this.productsClientService.findById(dto.productId);

    if (!product.isActive) {
      throw new BadRequestException(
        'Produto inativo não pode ser adicionado ao carrinho',
      );
    }

    let cart = await this.findActiveCartEntity(userId);

    if (!cart) {
      cart = await this.cartRepository.save(
        this.cartRepository.create({ userId, status: 'active', total: 0 }),
      );
      cart.items = [];
    }

    const existingItem = cart.items.find(
      (item) => item.productId === dto.productId,
    );

    if (existingItem) {
      const newQuantity = existingItem.quantity + dto.quantity;

      await this.cartItemRepository.update(existingItem.id, {
        quantity: newQuantity,
        subtotal: Number(existingItem.price) * newQuantity,
      });
    } else {
      const price = Number(product.price);

      await this.cartItemRepository.save(
        this.cartItemRepository.create({
          cartId: cart.id,
          productId: product.id,
          productName: product.name,
          price,
          quantity: dto.quantity,
          subtotal: price * dto.quantity,
        }),
      );
    }

    return this.rebuildCartResponse(cart.id);
  }

  async getCart(userId: string): Promise<CartResponse> {
    const cart = await this.findActiveCartEntity(userId);

    if (!cart) {
      return { userId, status: 'active', items: [], total: 0 };
    }

    return this.rebuildCartResponse(cart.id);
  }

  async removeItem(userId: string, itemId: string): Promise<CartResponse> {
    const cart = await this.findActiveCartEntity(userId);
    const item = cart?.items.find((cartItem) => cartItem.id === itemId);

    if (!cart || !item) {
      throw new NotFoundException('Item não encontrado no carrinho');
    }

    await this.cartItemRepository.delete(itemId);

    return this.rebuildCartResponse(cart.id);
  }

  private async findActiveCartEntity(userId: string): Promise<Cart | null> {
    return this.cartRepository.findOne({
      where: { userId, status: 'active' },
    });
  }

  private async rebuildCartResponse(cartId: string): Promise<CartResponse> {
    const cart = await this.cartRepository.findOneOrFail({
      where: { id: cartId },
    });

    const total = cart.items.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0,
    );

    await this.cartRepository.update(cartId, { total });

    return {
      id: cart.id,
      userId: cart.userId,
      status: cart.status,
      total,
      items: cart.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        price: Number(item.price),
        quantity: item.quantity,
        subtotal: Number(item.subtotal),
      })),
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };
  }
}
