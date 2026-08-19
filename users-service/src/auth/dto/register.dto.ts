import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../users/entities/user.entity';

export class RegisterDto {
  @IsNotEmpty({ message: 'email é obrigatório' })
  @IsEmail({}, { message: 'email deve ser um endereço de email válido' })
  email: string;

  @IsNotEmpty({ message: 'password é obrigatório' })
  @IsString()
  @MinLength(6, { message: 'password deve ter no mínimo 6 caracteres' })
  password: string;

  @IsNotEmpty({ message: 'firstName é obrigatório' })
  @IsString()
  @MaxLength(100, { message: 'firstName deve ter no máximo 100 caracteres' })
  firstName: string;

  @IsNotEmpty({ message: 'lastName é obrigatório' })
  @IsString()
  @MaxLength(100, { message: 'lastName deve ter no máximo 100 caracteres' })
  lastName: string;

  @IsEnum(UserRole, { message: 'role deve ser seller ou buyer' })
  role: UserRole;
}
