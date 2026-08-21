import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentConsumerService } from './payment-consumer/payment-consumer.service';
import { PaymentQueueService } from './payment-queue/payment-queue.service';
import { RabbitmqService } from './rabbitmq/rabbitmq.service';
import { DlqService } from './dlq/dlq.service';
import { DlqController } from './dlq/dlq.controller';
import { ConsumerMetricsController } from './consumer-metrics/consumer-metrics.controller';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [ConfigModule, PaymentsModule],
  controllers: [DlqController, ConsumerMetricsController],
  providers: [
    RabbitmqService,
    PaymentQueueService,
    PaymentConsumerService,
    DlqService,
  ],
})
export class EventsModule {}
