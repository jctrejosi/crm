import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CampaignMessageDto {
  @IsEnum(['whatsapp', 'email', 'sms'])
  channel: 'whatsapp' | 'email' | 'sms';

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  html?: string;

  @IsOptional()
  @IsObject()
  emailBlocks?: Record<string, unknown>;
}

export class CreateCampaignDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  productId?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  productIds?: number[];

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsIn(['multi', 'bundle'])
  mode?: 'multi' | 'bundle';

  @IsOptional()
  @IsArray()
  @IsEnum(['whatsapp', 'email', 'sms'], { each: true })
  channels?: ('whatsapp' | 'email' | 'sms')[];

  /** Canal prioritario de envío: el destinatario recibe un solo mensaje por este canal. */
  @IsOptional()
  @IsEnum(['whatsapp', 'email', 'sms'])
  priorityChannel?: 'whatsapp' | 'email' | 'sms';

  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsArray()
  @Type(() => CampaignMessageDto)
  messages?: CampaignMessageDto[];
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  productId?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  productIds?: number[];

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsIn(['multi', 'bundle'])
  mode?: 'multi' | 'bundle';

  @IsOptional()
  @IsArray()
  @IsEnum(['whatsapp', 'email', 'sms'], { each: true })
  channels?: ('whatsapp' | 'email' | 'sms')[];

  /** Canal prioritario de envío: el destinatario recibe un solo mensaje por este canal. */
  @IsOptional()
  @IsEnum(['whatsapp', 'email', 'sms'])
  priorityChannel?: 'whatsapp' | 'email' | 'sms';

  @IsOptional()
  @IsEnum(['borrador', 'programada', 'enviando', 'enviada', 'fallida'])
  status?: 'borrador' | 'programada' | 'enviando' | 'enviada' | 'fallida';

  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsArray()
  @Type(() => CampaignMessageDto)
  messages?: CampaignMessageDto[];
}

export class GenerateRecipientsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(['whatsapp', 'email', 'sms'], { each: true })
  channels?: ('whatsapp' | 'email' | 'sms')[];

  @IsOptional()
  @IsInt()
  @Min(0)
  segment?: number;

  @IsOptional()
  @IsString()
  modelName?: string;

  @IsOptional()
  @IsIn(['multi', 'bundle'])
  mode?: 'multi' | 'bundle';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  manualCedulas?: string[];
}

export class GenerateContentDto {
  @IsOptional()
  @IsNumber()
  productId?: number;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  products?: { id?: number; name?: string; price?: number }[];

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsArray()
  @IsEnum(['whatsapp', 'email', 'sms'], { each: true })
  channels: ('whatsapp' | 'email' | 'sms')[];
}

export class InterpretSegmentDto {
  @IsOptional()
  @IsIn(['multi', 'bundle'])
  mode?: 'multi' | 'bundle';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productNames?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @IsOptional()
  @IsInt()
  bestSegment?: number;

  @IsOptional()
  @IsArray()
  ranking?: { segment?: number; total?: number; buyers?: number; share?: number }[];

  @IsOptional()
  @IsInt()
  segmentTotal?: number;

  @IsOptional()
  @IsInt()
  total?: number;

  @IsOptional()
  @IsInt()
  buyers?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsBoolean()
  bundleFallback?: boolean;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsNumber()
  avgPropensity?: number;

  @IsOptional()
  @IsNumber()
  avgUplift?: number;
}

export class ScoreClientsFiltersDto {
  @IsOptional()
  @IsInt()
  segment?: number;

  @IsOptional()
  @IsNumber()
  minFrecuencia?: number;

  @IsOptional()
  @IsNumber()
  maxFrecuencia?: number;

  @IsOptional()
  @IsNumber()
  minMonetario?: number;

  @IsOptional()
  @IsNumber()
  maxMonetario?: number;

  @IsOptional()
  @IsNumber()
  minTicketPromedio?: number;

  @IsOptional()
  @IsNumber()
  maxTicketPromedio?: number;

  @IsOptional()
  @IsNumber()
  minCategoriasDistintas?: number;

  @IsOptional()
  @IsNumber()
  maxCategoriasDistintas?: number;

  // ── Ubicación ──
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ciudades?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  barrios?: string[];

  @IsOptional()
  @IsString()
  direccionContiene?: string;

  // ── Demografía ──
  @IsOptional()
  @IsNumber()
  minEdad?: number;

  @IsOptional()
  @IsNumber()
  maxEdad?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sexos?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  estadosCiviles?: string[];

  @IsOptional()
  @IsNumber()
  minHijos?: number;

  @IsOptional()
  @IsNumber()
  maxHijos?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  profesiones?: string[];

  // ── Económico (proxy de ingresos: gasto histórico y puntos) ──
  @IsOptional()
  @IsNumber()
  minValorTotal?: number;

  @IsOptional()
  @IsNumber()
  maxValorTotal?: number;

  @IsOptional()
  @IsNumber()
  minPuntos?: number;

  @IsOptional()
  @IsNumber()
  maxPuntos?: number;

  // ── Estilo de vida ──
  @IsOptional()
  @IsBoolean()
  tieneMascota?: boolean;

  @IsOptional()
  @IsBoolean()
  tieneCarro?: boolean;

  @IsOptional()
  @IsBoolean()
  esEmpleado?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clubs?: string[];

  // ── Contacto legal ──
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  consentimientos?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sucursales?: string[];
}

export class ScoreClientsDto {
  @IsOptional()
  @IsObject()
  @Type(() => ScoreClientsFiltersDto)
  filters?: ScoreClientsFiltersDto;

  @IsOptional()
  @IsNumber()
  minPropensity?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeCedulas?: string[];

  @IsOptional()
  @IsIn(['propensity', 'uplift', 'segment', 'cedula'])
  sort?: 'propensity' | 'uplift' | 'segment' | 'cedula';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

/** Lista manual de clientes para la audiencia: por cédulas o por filtros.
 *  Con `filters` el backend resuelve todos los clientes que cumplen esas
 *  características (los "clientes con esas características" de la UI). */
export class ManualAudienceDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cedulas?: string[];

  @IsOptional()
  @IsObject()
  @Type(() => ScoreClientsFiltersDto)
  filters?: ScoreClientsFiltersDto;
}

/** Define el origen del público objetivo de una campaña ya creada. */
export class ApplyAudienceDto {
  @IsIn(['auto', 'manual', 'mixed'])
  mode: 'auto' | 'manual' | 'mixed';

  @IsOptional()
  @IsObject()
  @Type(() => ScoreClientsFiltersDto)
  filters?: ScoreClientsFiltersDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cedulas?: string[];
}

/** Producto para la sugerencia de nombre (nombre/precio ya resueltos por la UI). */
export class SuggestNameProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  price?: number;
}

/** Pide a la IA un nombre corto para la campaña a partir de los productos. */
export class SuggestNameDto {
  @IsOptional()
  @IsArray()
  @Type(() => SuggestNameProductDto)
  products?: SuggestNameProductDto[];

  @IsOptional()
  @IsString()
  prompt?: string;
}
