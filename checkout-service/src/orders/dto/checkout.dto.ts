import { IsIn, IsNotEmpty } from 'class-validator';

export const PAYMENT_METHODS = [
  'credit_card',
  'debit_card',
  'pix',
  'boleto',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export class CheckoutDto {
  @IsNotEmpty({ message: 'paymentMethod é obrigatório' })
  @IsIn(PAYMENT_METHODS, {
    message: `paymentMethod deve ser um dos valores: ${PAYMENT_METHODS.join(', ')}`,
  })
  paymentMethod: PaymentMethod;
}
