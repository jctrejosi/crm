import { registerAs } from '@nestjs/config';
import { CorsConfig } from './types';
import { isLanOrigin } from '../utils/origins';

export default registerAs('cors', (): CorsConfig => {
  const origin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

  // Los paneles se abren desde el celular con la IP del equipo, que cambia con
  // cada red, así que no vale listarlas una a una. Si toda la lista apunta a la
  // red local estamos en desarrollo y se acepta además cualquier origen de esa
  // red; en producción (dominios reales) no. Se puede forzar con
  // CORS_ALLOW_LAN=true/false.
  const allowLan =
    process.env.CORS_ALLOW_LAN != null
      ? process.env.CORS_ALLOW_LAN === 'true'
      : origin.length > 0 && origin.every(isLanOrigin);

  return {
    origin,
    allowLan,
    credentials: process.env.CORS_CREDENTIALS === 'true' || false,
    methods: process.env.CORS_METHODS
      ? process.env.CORS_METHODS.split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: process.env.CORS_ALLOWED_HEADERS
      ? process.env.CORS_ALLOWED_HEADERS.split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: process.env.CORS_EXPOSED_HEADERS
      ? process.env.CORS_EXPOSED_HEADERS.split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : ['Content-Range', 'X-Content-Range'],
    maxAge: parseInt(process.env.CORS_MAX_AGE ?? '86400', 10),
    preflightContinue: process.env.CORS_PREFLIGHT_CONTINUE === 'true' || false,
    optionsSuccessStatus: parseInt(
      process.env.CORS_OPTIONS_SUCCESS_STATUS ?? '204',
      10,
    ),
  };
});
