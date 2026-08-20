import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

enum Role {
  SELLER = 'seller',
  BUYER = 'buyer',
}

export class RegisterDto {
  @ApiProperty({ description: 'Email do usuário', example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Senha do usuário',
    example: 'password123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ description: 'Primeiro nome', example: 'João' })
  @IsString()
  firstName!: string;

  @ApiProperty({ description: 'Último nome', example: 'Silva' })
  @IsString()
  lastName!: string;

  @ApiProperty({
    description: 'Role do usuário',
    example: 'buyer',
    enum: ['seller', 'buyer'],
  })
  @IsEnum(Role, { message: 'role deve ser seller ou buyer' })
  role: Role;
}
