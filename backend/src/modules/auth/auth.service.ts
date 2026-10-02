import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DrizzleService } from '../../database/drizzle.service';
import { users, userRefreshTokens } from '../../../drizzle/schema';
import { eq, and, or, ne } from 'drizzle-orm';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import * as bcrypt from 'bcryptjs';

export interface JwtPayload {
  sub: number; // users.id
  email: string;
  username: string;
  isSuperuser: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user: {
    id: number;
    email: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
    isSuperuser: boolean;
    isActive: boolean;
    phone?: string | null;
    /** Foto de perfil (Cloudinary); null si no tiene. */
    avatarUrl?: string | null;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCK_DURATION_MINUTES = 15;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private get db() {
    return this.drizzle.db;
  }

  /**
   * Validar usuario por email O username con bloqueo por intentos fallidos
   */
  async validateUser(
    identifier: string,
    password: string,
  ): Promise<typeof users.$inferSelect | null> {
    // Buscar por email O username
    const results = await this.db
      .select()
      .from(users)
      .where(or(eq(users.email, identifier), eq(users.username, identifier)))
      .limit(1);

    if (!results.length) {
      this.logger.warn(
        `Intento de login fallido: usuario "${identifier}" no encontrado`,
      );
      return null;
    }

    const user = results[0];

    // Verificar si la cuenta está bloqueada
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const remainingMinutes = Math.ceil(
        (new Date(user.lockedUntil).getTime() - Date.now()) / (60 * 1000),
      );
      this.logger.warn(
        `Intento de login fallido: usuario "${identifier}" bloqueado por ${remainingMinutes} minutos`,
      );
      throw new UnauthorizedException(
        `Cuenta bloqueada temporalmente. Intente nuevamente en ${remainingMinutes} minutos.`,
      );
    }

    if (!user.isActive) {
      this.logger.warn(
        `Intento de login fallido: usuario "${identifier}" inactivo`,
      );
      return null;
    }

    if (!user.passwordHash) {
      this.logger.warn(
        `Intento de login fallido: usuario "${identifier}" sin hash de contraseña`,
      );
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      this.logger.warn(
        `Intento de login fallido: contraseña incorrecta para "${identifier}"`,
      );

      // Incrementar intentos fallidos
      const newAttempts = (user.failedAttempts || 0) + 1;
      const updateData: Partial<typeof users.$inferInsert> = {
        failedAttempts: newAttempts,
      };

      // Bloquear si supera el límite
      if (newAttempts >= this.MAX_LOGIN_ATTEMPTS) {
        const lockedUntil = new Date(
          Date.now() + this.LOCK_DURATION_MINUTES * 60 * 1000,
        );
        updateData.lockedUntil = lockedUntil.toISOString();
        this.logger.warn(
          `Usuario "${identifier}" bloqueado por ${this.LOCK_DURATION_MINUTES} minutos (${newAttempts} intentos fallidos)`,
        );
        throw new UnauthorizedException(
          `Demasiados intentos fallidos. Cuenta bloqueada por ${this.LOCK_DURATION_MINUTES} minutos.`,
        );
      }

      await this.db.update(users).set(updateData).where(eq(users.id, user.id));

      return null;
    }

    // Resetear intentos fallidos y actualizar último login
    await this.db
      .update(users)
      .set({
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));

    return user;
  }

  /**
   * Login con email o username
   */
  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const user = await this.validateUser(
      loginDto.identifier,
      loginDto.password,
    );

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload: JwtPayload = {
      sub: Number(user.id),
      email: user.email,
      username: user.username,
      isSuperuser: user.isSuperuser,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshTokenString = this.generateRefreshToken(payload);

    // Guardar refresh token en BD
    const expiresAt = new Date(
      Date.now() +
        this.parseDurationToSeconds(
          this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d',
        ) *
          1000,
    );

    await this.db.insert(userRefreshTokens).values({
      userId: Number(user.id),
      token: refreshTokenString,
      expiresAt: expiresAt.toISOString(),
    });

    const fullName =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      'Usuario';

    return {
      accessToken,
      refreshToken: refreshTokenString,
      expiresIn: this.getJwtExpiration(),
      user: {
        id: Number(user.id),
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName,
        isSuperuser: user.isSuperuser,
        isActive: user.isActive,
        phone: user.phone,
        avatarUrl: user.avatarUrl ?? null,
      },
    };
  }

  /**
   * Refresca el token de acceso
   */
  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    try {
      const jwtSecret = this.configService.get<string>('JWT_SECRET');

      if (!jwtSecret) {
        this.logger.error('JWT secret no configurado');
        throw new UnauthorizedException('Configuración inválida');
      }

      const tokenString = refreshTokenDto.refreshToken;

      if (!tokenString) {
        this.logger.warn('Refresh token no provisto');
        throw new UnauthorizedException('Refresh token inválido o expirado');
      }

      // Verificar en BD que existe, no está revocado y no expiró
      const storedTokens = await this.db
        .select()
        .from(userRefreshTokens)
        .where(eq(userRefreshTokens.token, tokenString))
        .limit(1);

      if (!storedTokens.length) {
        this.logger.warn('Refresh token no encontrado en BD');
        throw new UnauthorizedException('Refresh token inválido');
      }

      const storedToken = storedTokens[0];

      if (storedToken.revoked) {
        this.logger.warn(
          `Refresh token revocado para user ID ${storedToken.userId}`,
        );
        throw new UnauthorizedException('Refresh token revocado');
      }

      if (new Date(storedToken.expiresAt) < new Date()) {
        this.logger.warn(
          `Refresh token expirado para user ID ${storedToken.userId}`,
        );
        await this.db
          .delete(userRefreshTokens)
          .where(eq(userRefreshTokens.id, storedToken.id));
        throw new UnauthorizedException('Refresh token expirado');
      }

      // Validar payload del token
      const payload = this.jwtService.verify<JwtPayload>(tokenString, {
        secret: jwtSecret,
      });

      // Verificar que el usuario existe y está activo
      const userResults = await this.db
        .select()
        .from(users)
        .where(eq(users.id, BigInt(payload.sub)))
        .limit(1);

      if (!userResults.length || !userResults[0].isActive) {
        this.logger.warn(`Usuario ${payload.sub} no válido o inactivo`);
        await this.db
          .update(userRefreshTokens)
          .set({ revoked: true })
          .where(eq(userRefreshTokens.userId, payload.sub));
        throw new UnauthorizedException('Usuario no válido');
      }

      const user = userResults[0];

      // Generar nuevo access token
      const newPayload: JwtPayload = {
        sub: Number(user.id),
        email: user.email,
        username: user.username,
        isSuperuser: user.isSuperuser,
      };

      const accessToken = this.jwtService.sign(newPayload);

      return {
        accessToken,
        expiresIn: this.getJwtExpiration(),
      };
    } catch (error) {
      this.logger.error(
        `Error al refrescar token: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
  }

  /**
   * Obtiene el perfil completo del usuario autenticado
   */
  async getProfile(userId: number) {
    const results = await this.db
      .select()
      .from(users)
      .where(eq(users.id, BigInt(userId)))
      .limit(1);

    if (!results.length) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    const user = results[0];
    const fullName =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      'Usuario';

    return {
      id: Number(user.id),
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName,
      phone: user.phone,
      avatarUrl: user.avatarUrl ?? null,
      isSuperuser: user.isSuperuser,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Actualiza el perfil del usuario autenticado (nombre, teléfono, email).
   */
  async updateProfile(
    userId: number,
    body: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
    },
  ) {
    const patch: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.firstName !== undefined) patch.firstName = body.firstName.trim();
    if (body.lastName !== undefined) patch.lastName = body.lastName.trim();
    if (body.phone !== undefined) patch.phone = body.phone.trim() || null;

    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase();
      if (!email)
        throw new BadRequestException('El email no puede estar vacío');
      const [dup] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), ne(users.id, BigInt(userId))))
        .limit(1);
      if (dup) throw new ConflictException('Ese email ya está en uso');
      patch.email = email;
    }

    await this.db
      .update(users)
      .set(patch)
      .where(eq(users.id, BigInt(userId)));
    return this.getProfile(userId);
  }

  /**
   * Cambia la contraseña del usuario autenticado exigiendo la actual.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const results = await this.db
      .select()
      .from(users)
      .where(eq(users.id, BigInt(userId)))
      .limit(1);
    if (!results.length) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }
    const user = results[0];
    if (!user.passwordHash) {
      throw new BadRequestException(
        'El usuario no tiene contraseña configurada',
      );
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok)
      throw new UnauthorizedException('La contraseña actual no es correcta');
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException(
        'La nueva contraseña debe tener al menos 8 caracteres',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date().toISOString() })
      .where(eq(users.id, BigInt(userId)));

    return { success: true };
  }

  /**
   * Cierra la sesión (logout) y revoca el refresh token
   */
  async logout(
    userId: number,
    refreshTokenString?: string,
  ): Promise<{ success: boolean; message: string }> {
    if (refreshTokenString) {
      // Revocar solo el token específico
      const result = await this.db
        .update(userRefreshTokens)
        .set({ revoked: true })
        .where(
          and(
            eq(userRefreshTokens.token, refreshTokenString),
            eq(userRefreshTokens.userId, userId),
          ),
        );

      if (result.rowCount === 0) {
        this.logger.warn(
          `Intento de logout con token inválido para user ${userId}`,
        );
      } else {
        this.logger.log(`Refresh token revocado para user ID ${userId}`);
      }
    } else {
      // Revocar todos los tokens del usuario
      await this.db
        .update(userRefreshTokens)
        .set({ revoked: true })
        .where(eq(userRefreshTokens.userId, userId));
      this.logger.log(
        `Todos los refresh tokens revocados para user ID ${userId}`,
      );
    }

    return {
      success: true,
      message: 'Sesión cerrada exitosamente',
    };
  }

  /**
   * Genera un refresh token con expiración más larga.
   * Solo incluye el `sub`: el token completo con todos los claims excede el
   * límite de la columna `user_refresh_tokens.token` (varchar 255).
   */
  private generateRefreshToken(payload: JwtPayload): string {
    const refreshExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d';
    return this.jwtService.sign(
      { sub: payload.sub },
      { expiresIn: this.parseDurationToSeconds(refreshExpiresIn) },
    );
  }

  /**
   * Obtiene el tiempo de expiración del token en segundos
   */
  private getJwtExpiration(): number {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') ?? '7d';
    return this.parseDurationToSeconds(expiresIn);
  }

  /**
   * Convierte una duración (ej: "7d", "1h") a segundos
   */
  private parseDurationToSeconds(duration: string): number {
    const value = parseInt(duration, 10);
    const unit = duration.replace(/[0-9]/g, '');

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 604800; // 7 días por defecto
    }
  }
}
