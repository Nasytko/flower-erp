import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';

// Load monorepo root .env for local development (no-op if file missing).
loadDotenv({ path: path.resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import { loadApiEnv } from '@flower/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './infrastructure/http/global-exception.filter';
import { requestIdMiddleware } from './infrastructure/http/request-id.middleware';
import { createLogger } from './infrastructure/logging/logger';
import { pinoHttpMiddleware } from './infrastructure/logging/pino-http.middleware';

async function bootstrap(): Promise<void> {
  const env = loadApiEnv();
  const logger = createLogger(env.LOG_LEVEL);

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: false,
  });

  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: env.BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: env.BODY_LIMIT }));
  app.use(requestIdMiddleware);
  app.use(pinoHttpMiddleware(logger));

  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  app.setGlobalPrefix(env.API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Swagger is off unless SWAGGER_ENABLED=true (production default: false).
  if (env.SWAGGER_ENABLED) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Flower ERP API')
      .setDescription('Modular monolith REST API scaffold')
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(env.SWAGGER_PATH, app, document);
    logger.info({ path: env.SWAGGER_PATH }, 'Swagger enabled');
  }

  await app.listen(env.PORT);
  logger.info(
    { port: env.PORT, prefix: env.API_PREFIX, env: env.NODE_ENV },
    'Flower ERP API listening',
  );
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal bootstrap error', error);
  process.exit(1);
});
