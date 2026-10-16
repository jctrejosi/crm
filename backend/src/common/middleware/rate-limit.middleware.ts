import type { NextFunction, Request, Response } from 'express';

/**
 * Limitador de tasa en memoria (ventana fija) para endpoints sensibles.
 *
 * No usa dependencias externas ni servicios: apropiado para un despliegue de
 * una sola instancia. Protege sobre todo `/auth/*` (fuerza bruta / credential
 * stuffing contra el login del panel).
 *
 * ⚠️ Detrás de un proxy (Caddy) hay que activar `TRUST_PROXY` para que `req.ip`
 * sea la IP real del cliente vía `X-Forwarded-For`; si no, TODAS las peticiones
 * comparten la IP del proxy y el límite se agotaría globalmente.
 *
 * Se activa con `RATE_LIMIT_ENABLED=true` (por defecto desactivado, para no
 * alterar entornos locales que no están detrás de proxy).
 */

export interface RateLimitRule {
  /** Nombre corto para las claves del cubo (y para depurar). */
  name: string;
  /** Se aplica si el path de la petición cumple este patrón. */
  match: RegExp;
  /** Peticiones permitidas por ventana y por IP. */
  limit: number;
  /** Tamaño de la ventana en milisegundos. */
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const CLEANUP_INTERVAL_MS = 60_000;

export function isRateLimitEnabled(): boolean {
  const value = (process.env.RATE_LIMIT_ENABLED ?? '').toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

export function createRateLimitMiddleware(rules: RateLimitRule[]) {
  const buckets = new Map<string, Bucket>();
  let lastCleanup = Date.now();

  return function rateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const now = Date.now();

    // Evita que el mapa crezca sin control: purga los cubos vencidos.
    if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      lastCleanup = now;
    }

    const rule = rules.find((r) => r.match.test(req.path));
    if (!rule) {
      next();
      return;
    }

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${rule.name}:${ip}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > rule.limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.',
      });
      return;
    }

    next();
  };
}

/**
 * Reglas por defecto: endpoints públicos de autenticación del CRM.
 *  - POST /auth/login   (fuerza bruta)
 *  - POST /auth/refresh (abuso de tokens)
 */
export const DEFAULT_RATE_LIMIT_RULES: RateLimitRule[] = [
  {
    name: 'auth',
    match: /^\/auth\/[a-z-]*(login|register|refresh|reset|forgot|social)[a-z/-]*$/i,
    limit: 15,
    windowMs: 60_000,
  },
];
