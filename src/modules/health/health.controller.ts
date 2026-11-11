import { Controller, Get } from '@nestjs/common';

import type { IHealthController, IHealthStatus } from './types';

/**
 * HTTP healthcheck приложения: нужен контейнеру и деплою.
 * GraphQL-версия появится в задаче graphql-layer.
 */
@Controller('health')
export class HealthController implements IHealthController {
  /**
   * Возвращает статус приложения.
   */
  @Get()
  check(): IHealthStatus {
    return { status: 'ok' };
  }
}
