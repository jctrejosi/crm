/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export interface SwaggerConfig {
  title: string;
  description: string;
  version: string;
  path: string;
  serverUrl: string;
}

export function getSwaggerConfig(configService: ConfigService): SwaggerConfig {
  const port = configService.get<number>('app.port') ?? 3000;

  return {
    title: 'Ecommerce API',
    description: 'API documentation for the Ecommerce platform',
    version: '1.0.0',
    path: 'docs',
    serverUrl:
      configService.get<string>('swagger.serverUrl') ??
      `http://localhost:${port}`,
  };
}

export function setupSwagger(app: INestApplication): void {
  const logger = new Logger('Swagger');
  const configService = app.get(ConfigService);
  const swaggerConfig = getSwaggerConfig(configService);

  const documentConfig = new DocumentBuilder()
    .setTitle(swaggerConfig.title)
    .setDescription(swaggerConfig.description)
    .setVersion(swaggerConfig.version)
    .addServer(swaggerConfig.serverUrl)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token',
      },
      'JWT-auth',
    )
    .addTag('Auth')
    .addTag('Customers')
    .addTag('Products')
    .addTag('Categories')
    .addTag('Brands')
    .addTag('Cart')
    .addTag('Orders')
    .addTag('Payments')
    .addTag('Inventory')
    .addTag('Admin')
    .build();

  const document = SwaggerModule.createDocument(app, documentConfig, {
    deepScanRoutes: true,
    ignoreGlobalPrefix: false,
  });

  SwaggerModule.setup(swaggerConfig.path, app, document, {
    customSiteTitle: swaggerConfig.title,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      deepLinking: true,
      defaultModelExpandDepth: 3,
      defaultModelsExpandDepth: 1,
    },
  });

  logger.log(
    `Documentation available at ${swaggerConfig.serverUrl}/${swaggerConfig.path}`,
  );
}
