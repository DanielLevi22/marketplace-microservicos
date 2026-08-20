import { Module } from '@nestjs/common';
import { ProxyModule } from 'src/proxy/proxy.module';
import { UsersController } from './users.controller';

@Module({
  imports: [ProxyModule],
  controllers: [UsersController],
})
export class UsersModule {}
