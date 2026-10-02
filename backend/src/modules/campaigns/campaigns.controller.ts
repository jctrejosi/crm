import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  Post,
  Put,
  Query,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import {
  ApplyAudienceDto,
  CreateCampaignDto,
  GenerateContentDto,
  GenerateRecipientsDto,
  InterpretSegmentDto,
  ManualAudienceDto,
  ScoreClientsDto,
  SuggestNameDto,
  UpdateCampaignDto,
} from './dto/campaign.dto';

@ApiTags('Admin - Campañas')
@Controller('admin/campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar campañas (opcional: filtrar por estado)' })
  @ApiResponse({ status: 200, description: 'Listado de campañas' })
  list(@Query('status') status?: string) {
    return this.campaignsService.list(status);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una campaña' })
  @ApiResponse({ status: 201, description: 'Campaña creada' })
  create(@Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(dto);
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Genera contenido con IA (/ia-service): whatsapp, email (bloques del diseñador) y sms',
  })
  @ApiResponse({ status: 200, description: 'Contenido recomendado' })
  generate(@Body() dto: GenerateContentDto) {
    return this.campaignsService.generateContent(dto);
  }

  @Post('suggest-name')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sugiere un nombre de campaña con IA a partir de los productos (vía /ia-service)',
  })
  @ApiResponse({ status: 200, description: 'Nombre sugerido' })
  suggestName(@Body() dto: SuggestNameDto) {
    return this.campaignsService.suggestName(dto);
  }

  @Sse('segment-preview')
  @ApiOperation({
    summary:
      'Previsualiza la segmentación para unos productos (SSE con progreso por etapas, sin crear campaña)',
  })
  @ApiResponse({ status: 200, description: 'Eventos de progreso + resultado final' })
  segmentPreview(
    @Query('productIds') productIds: string,
    @Query('limit') limit?: string,
    @Query('mode') mode?: string,
  ): Observable<MessageEvent> {
    const ids = (productIds ?? '')
      .split(',')
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);
    return this.campaignsService.segmentPreviewStream(
      ids,
      limit ? Number(limit) : undefined,
      mode === 'bundle' ? 'bundle' : 'multi',
    );
  }

  @Post('clients/score')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Clientes con probabilidad de compra (filtros + score XGBoost/uplift) para analítica y segmentación manual',
  })
  @ApiResponse({ status: 200, description: 'Clientes puntuados (paginados)' })
  scoreClients(@Body() dto: ScoreClientsDto) {
    return this.campaignsService.scoreClients(dto);
  }

  @Get('clients/filter-options')
  @ApiOperation({
    summary:
      'Opciones de filtros de segmentación manual (ciudades, barrios, profesiones…) desde la réplica de analytics',
  })
  @ApiResponse({ status: 200, description: 'Opciones de filtro' })
  clientFilterOptions() {
    return this.campaignsService.clientFilterOptions();
  }

  @Post(':id/recipients/manual')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Añadir clientes manualmente (por cédula o por filtros) a los destinatarios de la campaña',
  })
  @ApiResponse({ status: 200, description: 'Campaña con la audiencia actualizada' })
  addManualRecipients(@Param('id') id: string, @Body() dto: ManualAudienceDto) {
    return this.campaignsService.addManualRecipients(
      Number(id),
      dto.cedulas,
      dto.filters as unknown as Record<string, unknown> | undefined,
    );
  }

  @Post(':id/audience/manual-replace')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reemplazar TODO el público de la campaña por una audiencia manual (cédulas o filtros); la audiencia pasa a modo manual',
  })
  @ApiResponse({ status: 200, description: 'Campaña con el nuevo público' })
  replaceManualRecipients(@Param('id') id: string, @Body() dto: ManualAudienceDto) {
    return this.campaignsService.replaceManualRecipients(
      Number(id),
      dto.cedulas,
      dto.filters as unknown as Record<string, unknown> | undefined,
    );
  }

  @Post(':id/audience/recommended')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Usar (de nuevo) la recomendación por producto: re-segmenta y reemplaza el público (audiencia modo auto)',
  })
  @ApiResponse({ status: 200, description: 'Campaña con el público recomendado' })
  useRecommendedAudience(@Param('id') id: string) {
    return this.campaignsService.useRecommendedAudience(Number(id));
  }

  @Post(':id/audience')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Define el origen del público objetivo: auto (recomendación por producto), manual (solo la audiencia manual) o mixed (recomendada + manual)',
  })
  @ApiResponse({ status: 200, description: 'Campaña con la audiencia aplicada' })
  applyAudience(@Param('id') id: string, @Body() dto: ApplyAudienceDto) {
    return this.campaignsService.applyAudience(
      Number(id),
      dto.mode,
      dto.cedulas,
      dto.filters as unknown as Record<string, unknown> | undefined,
    );
  }

  @Post('interpret-segment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Interpreta con IA por qué se seleccionó ese público objetivo (vía /ia-service)',
  })
  @ApiResponse({ status: 200, description: 'Explicación en lenguaje natural' })
  interpretSegment(@Body() dto: InterpretSegmentDto) {
    return this.campaignsService.interpretSegment(dto);
  }

  @Post(':id/relaunch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Relanzar campaña: re-segmenta el público y registra el envío (historial intacto)',
  })
  @ApiResponse({ status: 200, description: 'Campaña relanzada' })
  relaunch(@Param('id') id: string) {
    return this.campaignsService.relaunch(Number(id));
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Historial inmutable de eventos de la campaña' })
  @ApiResponse({ status: 200, description: 'Lista de eventos' })
  history(@Param('id') id: string) {
    return this.campaignsService.history(Number(id));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una campaña con sus mensajes' })
  @ApiResponse({ status: 200, description: 'Detalle de la campaña' })
  findOne(@Param('id') id: string) {
    return this.campaignsService.findOne(Number(id));
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar una campaña' })
  @ApiResponse({ status: 200, description: 'Campaña actualizada' })
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaignsService.update(Number(id), dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar una campaña (soft delete)' })
  @ApiResponse({ status: 200, description: 'Campaña eliminada' })
  remove(@Param('id') id: string) {
    return this.campaignsService.remove(Number(id));
  }

  @Get(':id/recipients')
  @ApiOperation({ summary: 'Listar destinatarios de la campaña' })
  @ApiResponse({ status: 200, description: 'Destinatarios' })
  recipients(@Param('id') id: string) {
    return this.campaignsService.listRecipients(Number(id));
  }

  @Post(':id/recipients/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Generar recomendación de clientes (segmentación inteligente vía clustering-api; sin segmento usa aleatorio)',
  })
  @ApiResponse({ status: 200, description: 'Destinatarios recomendados' })
  generateRecipients(
    @Param('id') id: string,
    @Body() dto: GenerateRecipientsDto,
  ) {
    return this.campaignsService.generateRecipients(
      Number(id),
      dto.limit ?? 500,
      dto.segment,
      dto.modelName,
      dto.mode,
    );
  }
}
