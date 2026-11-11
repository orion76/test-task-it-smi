import 'reflect-metadata';

import { join } from 'node:path';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { validateApiFields } from './graphql/contract/api-fields.validator';

const logger = new Logger('Bootstrap');

/**
 * Поднимает HTTP-сервер: порт берётся из конфигурации, проверенной на старте
 * (`common/config/environment.validator.ts`), статика клиента отдаётся тем же процессом.
 */
async function bootstrap(): Promise<void> {
  // Конфиг API (`config/api-fields.yml`) решает, какие поля попадают в схему GraphQL. Проверка
  // повторяется здесь, потому что в образе лежит не `src`, а `dist`, и конфиг копируется рядом:
  // битый файл должен останавливать старт, а не молча сокращать API. Ошибка уходит в общий
  // обработчик ниже.
  validateApiFields();

  // The express adapter is requested explicitly because only it exposes `useStaticAssets`; the
  // application has no custom server setup otherwise.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // The built client sits next to `dist` in the image (`/app/public` vs `/app/dist`) and in the
  // repository root during a local `npm run start`; a missing directory is not an error, it only
  // means the API runs without the page. No SPA fallback: the client has no router, it is one page.
  app.useStaticAssets(join(__dirname, '..', 'public'), { index: 'index.html' });

  // Подписка на SIGTERM/SIGINT: контейнер останавливается штатно, а не по SIGKILL
  // через таймаут. Nest закрывает HTTP-сервер и вызывает onModuleDestroy/onApplicationShutdown.
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  await app.listen(port);

  logger.log(`Application is running on ${await app.getUrl()}`);
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Application failed to start: ${message}`);
  process.exit(1);
});
