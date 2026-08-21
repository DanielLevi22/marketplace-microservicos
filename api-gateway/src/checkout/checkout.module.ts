import { Module } from '@nestjs/common';
import { ProxyModule } from 'src/proxy/proxy.module';
import { CartProxyController } from './cart-proxy.controller';
import { OrdersProxyController } from './orders-proxy.controller';

@Module({
  imports: [ProxyModule],
  controllers: [CartProxyController, OrdersProxyController],
})
export class CheckoutModule {}
