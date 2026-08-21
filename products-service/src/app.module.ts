import './config/env';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { databaseConfig } from './config/database.config';
import { ProductsModule } from './products/products.module';
import { AuthModule } from './auth/auth.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseConfig),
    ProductsModule,
    AuthModule,
    MetricsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
