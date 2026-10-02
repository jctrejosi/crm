import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsEmail,
  IsOptional,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Email o nombre de usuario',
    example: 'admin@tienda.com',
    required: true,
  })
  @IsString({ message: 'El identificador debe ser un texto' })
  @IsNotEmpty({ message: 'El identificador es obligatorio' })
  @MinLength(3, {
    message: 'El identificador debe tener al menos 3 caracteres',
  })
  @MaxLength(60, {
    message: 'El identificador no puede exceder los 60 caracteres',
  })
  identifier!: string; // ← Cambiado de 'username' a 'identifier'

  @ApiProperty({
    description: 'Contraseña del usuario',
    example: 'admin123',
    required: true,
    minLength: 4,
  })
  @IsString({ message: 'La contraseña debe ser un texto' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(4, { message: 'La contraseña debe tener al menos 4 caracteres' })
  password!: string;
}
