import * as dotenv from 'dotenv';
dotenv.config();

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

  app.use(helmet());
  app.use(cookieParser(config.get<string>('COOKIE_SECRET')));

  // In production (Hostinger), API and frontend are on the same origin — CORS is only
  // needed for local dev where Next.js runs on a different port.
  const corsOrigins = config.get<string>('CORS_ORIGINS');
  if (corsOrigins) {
    app.enableCors({ origin: corsOrigins.split(','), credentials: true });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());

  app.setGlobalPrefix('api');

  const port = process.env.PORT || config.get<number>('PORT') || 3000;
  await app.listen(port);
  console.log(`Application is running on port: ${port}`);
}
bootstrap();
