import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from './interfaces/request.interface';
import type { Response } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Login con email y password
   * POST /auth/login
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Autentica un usuario con email y contraseña. Devuelve tokens JWT y establece cookies.',
  })
  @ApiBody({
    type: LoginDto,
    description: 'Credenciales de acceso',
    examples: {
      'usuario@tienda.com': {
        summary: 'Usuario administrador',
        value: {
          identifier: 'admin@tienda.com',
          password: 'admin123',
        },
      },
      'cliente@tienda.com': {
        summary: 'Usuario cliente',
        value: {
          identifier: 'cliente@tienda.com',
          password: 'cliente123',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Login exitoso. Retorna access token, refresh token y datos del usuario.',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expiresIn: 604800,
        user: {
          id: 1,
          email: 'admin@tienda.com',
          firstName: 'Admin',
          lastName: 'Principal',
          fullName: 'Admin Principal',
          isSuperuser: true,
          isActive: true,
          phone: '3001234567',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas o usuario bloqueado',
    schema: {
      example: {
        statusCode: 401,
        message: 'Credenciales inválidas',
        error: 'Unauthorized',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de entrada inválidos',
    schema: {
      example: {
        statusCode: 400,
        message: ['El nombre de usuario debe tener al menos 3 caracteres'],
        error: 'Bad Request',
      },
    },
  })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(loginDto);

    // Establecer cookie HTTP-only con el token
    response.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      path: '/',
    });

    // También el refresh token
    if (result.refreshToken) {
      response.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
        path: '/',
      });
    }

    return result;
  }

  /**
   * Refrescar token de acceso
   * POST /auth/refresh
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refrescar token de acceso',
    description:
      'Usa un refresh token válido para obtener un nuevo access token.',
  })
  @ApiBody({
    type: RefreshTokenDto,
    description: 'Refresh token',
    examples: {
      'refresh-token': {
        summary: 'Refresh token válido',
        value: {
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Token refrescado exitosamente',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expiresIn: 604800,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token inválido o expirado',
    schema: {
      example: {
        statusCode: 401,
        message: 'Refresh token inválido o expirado',
        error: 'Unauthorized',
      },
    },
  })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto);
  }

  /**
   * Obtener perfil del usuario autenticado
   * GET /auth/me
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiCookieAuth('access_token')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener perfil del usuario autenticado',
    description: 'Devuelve los datos del usuario actualmente autenticado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil del usuario',
    schema: {
      example: {
        id: 1,
        email: 'admin@tienda.com',
        firstName: 'Admin',
        lastName: 'Principal',
        fullName: 'Admin Principal',
        phone: '3001234567',
        isSuperuser: true,
        isActive: true,
        lastLoginAt: '2026-01-15T10:00:00.000Z',
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-15T10:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Token inválido o expirado',
    schema: {
      example: {
        statusCode: 401,
        message: 'Usuario no válido o inactivo',
        error: 'Unauthorized',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Usuario no encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Usuario con ID 1 no encontrado',
        error: 'Not Found',
      },
    },
  })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.sub);
  }

  /**
   * Actualizar el perfil del usuario autenticado
   * PATCH /auth/me
   */
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  @ApiCookieAuth('access_token')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Actualizar mi perfil',
    description: 'Actualiza nombre, teléfono y email del usuario autenticado.',
  })
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.sub, dto);
  }

  /**
   * Cambiar la contraseña del usuario autenticado
   * POST /auth/me/password
   */
  @UseGuards(JwtAuthGuard)
  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('access_token')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Cambiar mi contraseña',
    description:
      'Requiere la contraseña actual y una nueva (mínimo 8 caracteres).',
  })
  async changeMyPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  /**
   * Cerrar sesión
   * POST /auth/logout
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('access_token')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Cerrar sesión',
    description:
      'Revoca el refresh token y limpia las cookies de autenticación.',
  })
  @ApiBody({
    required: false,
    type: RefreshTokenDto,
    description: 'Refresh token específico para revocar (opcional)',
    examples: {
      'with-refresh-token': {
        summary: 'Con refresh token específico',
        value: {
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
      'without-refresh-token': {
        summary: 'Sin refresh token (revoca todos)',
        value: {},
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión cerrada exitosamente',
    schema: {
      example: {
        success: true,
        message: 'Sesión cerrada exitosamente',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Token inválido o expirado',
    schema: {
      example: {
        statusCode: 401,
        message: 'Usuario no válido o inactivo',
        error: 'Unauthorized',
      },
    },
  })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body?: { refreshToken?: string },
    @Res({ passthrough: true }) response?: Response,
  ) {
    // Limpiar cookies
    if (response) {
      response.clearCookie('access_token', { path: '/' });
      response.clearCookie('refresh_token', { path: '/' });
    }

    return this.authService.logout(user.sub, body?.refreshToken);
  }
}
