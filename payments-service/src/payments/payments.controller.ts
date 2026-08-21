import { Controller, Get, Param } from '@nestjs/common';
import { PaymentResponse, PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get(':orderId')
  findByOrderId(@Param('orderId') orderId: string): Promise<PaymentResponse> {
    return this.paymentsService.findByOrderId(orderId);
  }
}
