import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { DrizzleService } from '../../../database/drizzle.service'; // Ajusta la ruta según tu estructura
import { users } from '../../../../drizzle/schema';
import { eq } from 'drizzle-orm';

interface RequestWithCookies extends Request {
  cookies: {
    access_token?: string;
  };
}

export interface JwtPayload {
  sub: number;
  email: string;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly drizzle: DrizzleService, // ✅ Inyectar el servicio
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: RequestWithCookies): string | null => {
          return req.cookies?.access_token ?? null;
        },
        // También permitir Bearer token en header (opcional)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret') || 'secret-key',
    });
  }

  async validate(payload: JwtPayload) {
    // Verificar que el usuario existe y está activo
    const db = this.drizzle.db; // ✅ Usar la instancia de Drizzle

    const userId = BigInt(payload.sub);

    const result = await db
      .select({
        id: users.id,
        email: users.email,
        isActive: users.isActive,
        isSuperuser: users.isSuperuser,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!result.length || !result[0].isActive) {
      throw new UnauthorizedException('Usuario no válido o inactivo');
    }

    const user = result[0];

    return {
      sub: user.id,
      email: user.email,
      isSuperuser: user.isSuperuser,
    };
  }
}
