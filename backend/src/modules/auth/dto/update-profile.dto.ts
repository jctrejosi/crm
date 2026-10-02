import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Nombre del usuario',
    example: 'Laura',
  })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser un texto' })
  @MaxLength(100, {
    message: 'El nombre no puede exceder los 100 caracteres',
  })
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Apellido del usuario',
    example: 'Gómez',
  })
  @IsOptional()
  @IsString({ message: 'El apellido debe ser un texto' })
  @MaxLength(100, {
    message: 'El apellido no puede exceder los 100 caracteres',
  })
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Teléfono de contacto',
    example: '+57 300 123 4567',
  })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser un texto' })
  @MaxLength(50, {
    message: 'El teléfono no puede exceder los 50 caracteres',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico',
    example: 'laura@tienda.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'El email no tiene un formato válido' })
  @MaxLength(255, {
    message: 'El email no puede exceder los 255 caracteres',
  })
  email?: string;
}
