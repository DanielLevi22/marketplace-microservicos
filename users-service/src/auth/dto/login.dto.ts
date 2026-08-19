import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsNotEmpty({ message: 'email é obrigatório' })
  @IsEmail({}, { message: 'email deve ser um endereço de email válido' })
  email: string;

  @IsNotEmpty({ message: 'password é obrigatório' })
  @IsString()
  @MinLength(6, { message: 'password deve ter no mínimo 6 caracteres' })
  password: string;
}
