import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { writeSync } from 'node:fs';

// Load monorepo root .env for local development (no-op if file missing).
loadDotenv({ path: path.resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
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

/** Sync stderr write so Docker logs capture output before process.exit. */
function writeStderr(line: string): void {
  try {
    writeSync(2, line.endsWith('\n') ? line : `${line}\n`);
  } catch {
    // Fallback if fd 2 is unavailable
    console.error(line);
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}\n${err.stack ?? ''}`;
  }

  try {
    return typeof err === 'string' ? err : JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
}

function errorStack(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'stack' in err) {
    const stack = (err as { stack?: unknown }).stack;
    return typeof stack === 'string' ? stack : undefined;
  }
  return undefined;
}

function printFatal(label: string, err: unknown): void {
  writeStderr(label);
  writeStderr(formatError(err));
  // Also mirror via console for Nest / runtime tooling that patches console.
  console.error(label);
  console.error(err);
  const stack = errorStack(err);
  if (stack) {
    console.error(stack);
  }
}

// Install before bootstrap so Nest ExceptionsZone / async init cannot go silent.
process.on('uncaughtException', (err) => {
  printFatal('UNCAUGHT EXCEPTION', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  printFatal('UNHANDLED REJECTION', reason);
  process.exit(1);
});

async function bootstrap(): Promise<void> {
  // Nest logger must be ready before NestFactory.create so init errors are visible.
  const nestLogger = new Logger('Bootstrap');
  nestLogger.log('Starting Flower ERP API bootstrap...');

  let env;
  try {
    env = loadApiEnv();
  } catch (err) {
    printFatal('CONFIGURATION VALIDATION FAILED', err);
    throw err;
  }

  nestLogger.log(
    `Env loaded (NODE_ENV=${env.NODE_ENV}, PORT=${env.PORT}, prefix=${env.API_PREFIX})`,
  );

  const logger = createLogger(env.LOG_LEVEL);

  // abortOnError: false — do not let Nest DEFAULT_TEARDOWN exit before our catch prints.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
    abortOnError: false,
    logger: nestLogger,
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
  nestLogger.log(`Flower ERP API listening on port ${env.PORT}`);
  logger.info(
    { port: env.PORT, prefix: env.API_PREFIX, env: env.NODE_ENV },
    'Flower ERP API listening',
  );
}

bootstrap().catch((err) => {
  console.error('BOOTSTRAP FAILED');
  console.error(err);
  console.error(errorStack(err));
  writeStderr('BOOTSTRAP FAILED');
  writeStderr(formatError(err));
  process.exit(1);
});
