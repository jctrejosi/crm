import { registerAs } from '@nestjs/config';
import { AppConfig } from './types';

export default registerAs('app', (): AppConfig => {
  // BACKEND_PORT es el puerto dedicado del backend del CRM (3100 por defecto,
  // para no chocar con el backend del ecommerce en 3000). Se mantiene PORT
  // como respaldo para entornos donde solo se inyecta ese nombre.
  const port = parseInt(
    process.env.BACKEND_PORT ?? process.env.PORT ?? '3100',
    10,
  );
  return {
    port,
    nodeEnv: process.env.NODE_ENV ?? 'development',
  };
});
