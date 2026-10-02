import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class MicrosoftLoginDto {
  @IsString({ message: 'El token de acceso debe ser un texto' })
  @IsNotEmpty({ message: 'El token de acceso es obligatorio' })
  accessToken: string | undefined;

  @IsOptional()
  @IsString({ message: 'El ID del usuario debe ser un texto' })
  userId?: string;

  @IsOptional()
  @IsString({ message: 'El email debe ser un texto' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'El nombre debe ser un texto' })
  name?: string;
}
