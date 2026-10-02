import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Contraseña actual del usuario',
    example: 'admin123',
    required: true,
  })
  @IsString({ message: 'La contraseña actual debe ser un texto' })
  @IsNotEmpty({ message: 'La contraseña actual es obligatoria' })
  currentPassword!: string;

  @ApiProperty({
    description: 'Nueva contraseña (mínimo 8 caracteres)',
    example: 'nuevaClave123',
    required: true,
    minLength: 8,
  })
  @IsString({ message: 'La nueva contraseña debe ser un texto' })
  @MinLength(8, {
    message: 'La nueva contraseña debe tener al menos 8 caracteres',
  })
  newPassword!: string;
}
