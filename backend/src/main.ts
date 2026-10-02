/* eslint-disable @typescript-eslint/no-unsafe-call */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { httpLoggerMiddleware } from './utils/logger';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { CorsConfig, HelmetConfig } from './config';
import { isLanOrigin } from './utils/origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // ✅ 1. CORS PRIMERO (antes que cualquier otro middleware)
  const corsOptions = configService.get<CorsConfig>('cors');

  app.enableCors({
    // Con `allowLan` el origen se resuelve por petición (para poder aceptar la
    // IP del equipo en la red local); sin él se usa la lista configurada.
    origin: corsOptions?.allowLan
      ? (origin, cb) => {
          if (!origin) return cb(null, true);
          const configured = corsOptions?.origin;
          const listed = Array.isArray(configured)
            ? configured.includes(origin)
            : configured === true || configured === origin;
          return cb(null, listed || isLanOrigin(origin));
        }
      : corsOptions?.origin,
    credentials: corsOptions?.credentials ?? true,
    methods: corsOptions?.methods ?? [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
      'OPTIONS',
    ],
    allowedHeaders: corsOptions?.allowedHeaders ?? [
      'Content-Type',
      'Authorization',
      'Accept',
    ],
    exposedHeaders: corsOptions?.exposedHeaders ?? [],
    maxAge: corsOptions?.maxAge ?? 86400,
    preflightContinue: corsOptions?.preflightContinue ?? false,
    optionsSuccessStatus: corsOptions?.optionsSuccessStatus ?? 204,
  });

  // ✅ 2. Helmet (después de CORS)
  const helmetConfig = configService.get<HelmetConfig>('helmet');

  app.use(
    helmet({
      crossOriginResourcePolicy: helmetConfig?.crossOriginResourcePolicy ?? {
        policy: 'cross-origin',
      },
      crossOriginOpenerPolicy: helmetConfig?.crossOriginOpenerPolicy ?? {
        policy: 'unsafe-none',
      },
      crossOriginEmbedderPolicy:
        helmetConfig?.crossOriginEmbedderPolicy ?? false,
    }),
  );

  // ✅ 3. Correlation ID
  app.use(
    new CorrelationIdMiddleware().use.bind(new CorrelationIdMiddleware()),
  );

  // ✅ 4. Body parsers y otros middlewares
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.use(compression());
  app.use(httpLoggerMiddleware());
  app.use(cookieParser());

  // ✅ 5. Swagger (solo en desarrollo)
  if (configService.get('app.nodeEnv') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('HelpDesk API')
      .setDescription('API para el sistema de control de asistencia')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('app.port', 3100);
  await app.listen(port);

  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  console.log(
    `✅ CORS configurado con: ${JSON.stringify(corsOptions?.origin)}`,
  );
  console.log('🔍 Variables de entorno cargadas:');
  console.log('CORS_ORIGIN:', process.env.CORS_ORIGIN);
  console.log('NODE_ENV:', process.env.NODE_ENV);
}

bootstrap();
