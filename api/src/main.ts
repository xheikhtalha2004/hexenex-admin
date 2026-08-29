import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // This API is deliberately called cross-origin (separate frontend origin, in dev and
  // typically in production too) — helmet's default same-origin CORP silently blocks the
  // browser's Fetch/XHR from reading the response body even when CORS headers are correct.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser(config.get<string>('COOKIE_SECRET')));

  const corsOrigins = (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000').split(',');
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());

  app.setGlobalPrefix('api');

  const port = config.get<string>('PORT') ?? 4000;
  await app.listen(port);
}
bootstrap();
