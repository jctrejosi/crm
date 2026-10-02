import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiResponse,
  ApiOperation,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';

// Decorador combinado para endpoints protegidos
export function ApiProtected(
  summary: string,
  description?: string,
): MethodDecorator {
  return applyDecorators(
    ApiOperation({ summary, description }),
    ApiBearerAuth('JWT-auth'),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Invalid or missing token',
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden - Insufficient permissions',
    }),
  );
}

// Decorador para endpoints de administrador
export function ApiAdmin(
  summary: string,
  description?: string,
): MethodDecorator {
  return applyDecorators(
    ApiOperation({ summary, description }),
    ApiBearerAuth('JWT-auth'),
    SetMetadata('roles', ['admin']),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({ status: 403, description: 'Forbidden - Admin only' }),
  );
}

// Decorador para endpoints con paginación
export function ApiPaginatedResponse(
  model: string,
  description?: string,
): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: description ?? `Paginated list of ${model}`,
      schema: {
        properties: {
          data: {
            type: 'array',
            items: { $ref: `#/components/schemas/${model}` },
          },
          meta: {
            type: 'object',
            properties: {
              page: { type: 'number' },
              limit: { type: 'number' },
              total: { type: 'number' },
              totalPages: { type: 'number' },
            },
          },
        },
      },
    }),
  );
}

// Decorador para parámetros de paginación
export function ApiPagination() {
  return applyDecorators(
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'limit', required: false, type: Number, example: 10 }),
    ApiQuery({
      name: 'sortBy',
      required: false,
      type: String,
      example: 'createdAt',
    }),
    ApiQuery({
      name: 'sortOrder',
      required: false,
      enum: ['ASC', 'DESC'],
      example: 'DESC',
    }),
  );
}

// Decorador para parámetros de búsqueda
export function ApiSearch() {
  return applyDecorators(
    ApiQuery({
      name: 'search',
      required: false,
      type: String,
      description: 'Search term',
    }),
    ApiQuery({
      name: 'searchFields',
      required: false,
      type: String,
      description: 'Comma-separated fields to search',
    }),
  );
}

// Decorador para parámetros de filtro
export function ApiFilter() {
  return applyDecorators(
    ApiQuery({
      name: 'from',
      required: false,
      type: Date,
      description: 'Start date',
    }),
    ApiQuery({
      name: 'to',
      required: false,
      type: Date,
      description: 'End date',
    }),
    ApiQuery({
      name: 'status',
      required: false,
      type: String,
      description: 'Filter by status',
    }),
  );
}
