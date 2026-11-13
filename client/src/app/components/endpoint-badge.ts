import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Shows where the requests of the page actually go. The address is the origin of the page plus
 * `/graphql`: the dev server proxies it to the backend, so the browser never sends a cross-origin
 * request and the backend needs no CORS setup.
 */
@Component({
  selector: 'app-endpoint-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="endpoint">
      Эндпоинт: <code>{{ endpoint }}</code>. Dev-сервер Angular проксирует <code>/graphql</code> и
      <code>/health</code> на бэкенд: локально — <code>proxy.conf.json</code>
      (<code>http://localhost:3000</code>), в compose — <code>proxy.conf.docker.json</code>
      (<code>http://app:3000</code>).
    </p>
  `,
})
export class EndpointBadge {
  readonly endpoint = `${window.location.origin}/graphql`;
}
