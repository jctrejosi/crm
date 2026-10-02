import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

/** Lista de PLUs del catálogo a validar/resolver. */
export class ResolvePluDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5000)
  plus: string[];
}
