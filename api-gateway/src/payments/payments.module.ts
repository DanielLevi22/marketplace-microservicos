import { Module } from '@nestjs/common';
import { ProxyModule } from 'src/proxy/proxy.module';
import { PaymentsProxyController } from './payments-proxy.controller';

@Module({
  imports: [ProxyModule],
  controllers: [PaymentsProxyController],
})
export class PaymentsModule {}
