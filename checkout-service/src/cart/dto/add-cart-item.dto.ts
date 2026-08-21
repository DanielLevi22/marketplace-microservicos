import { IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator';

export class AddCartItemDto {
  @IsNotEmpty({ message: 'productId é obrigatório' })
  @IsUUID('4', { message: 'productId deve ser um UUID válido' })
  productId: string;

  @IsNotEmpty({ message: 'quantity é obrigatório' })
  @IsInt({ message: 'quantity deve ser um número inteiro' })
  @Min(1, { message: 'quantity deve ser no mínimo 1' })
  quantity: number;
}
