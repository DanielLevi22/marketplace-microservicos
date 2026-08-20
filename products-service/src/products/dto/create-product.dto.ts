import { IsInt, IsNotEmpty, IsNumber, IsString, Min, MaxLength } from 'class-validator';

export class CreateProductDto {
  @IsNotEmpty({ message: 'name é obrigatório' })
  @IsString()
  @MaxLength(255, { message: 'name deve ter no máximo 255 caracteres' })
  name: string;

  @IsNotEmpty({ message: 'description é obrigatório' })
  @IsString()
  description: string;

  @IsNotEmpty({ message: 'price é obrigatório' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'price deve ser um número decimal com até 2 casas' },
  )
  @Min(0.01, { message: 'price deve ser no mínimo 0.01' })
  price: number;

  @IsNotEmpty({ message: 'stock é obrigatório' })
  @IsInt({ message: 'stock deve ser um número inteiro' })
  @Min(0, { message: 'stock deve ser no mínimo 0' })
  stock: number;
}
