import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { ProductsClientService } from './products-client.service';

@Module({
  imports: [TypeOrmModule.forFeature([Cart, CartItem]), HttpModule],
  providers: [ProductsClientService],
  exports: [TypeOrmModule],
})
export class CartModule {}
