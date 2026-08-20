import { Module } from '@nestjs/common';
import { ProxyModule } from 'src/proxy/proxy.module';
import { ProductsController } from './products.controller';

@Module({
  imports: [ProxyModule],
  controllers: [ProductsController],
})
export class ProductsModule {}
