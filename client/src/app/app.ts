import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { runOperation } from './api/operation.runner';
import { ApiPanel } from './components/api-panel/api-panel';
import { EndpointBadge } from './components/endpoint-badge';
import { OperationPanel } from './components/operation-panel/operation-panel';
import { extractProfiles } from './components/profile-view/profile.mapper';
import { ProfileView } from './components/profile-view/profile-view';
import { ResultPanel } from './components/result-panel/result-panel';
import { INITIAL_STATE } from './constants';
import { toStatus } from './operation.status';
import type { IOperationRequest, IOperationState } from './types';

type UTabs = 'result' | 'help';

/**
 * The page owns the state of the current run: the panel only builds a request, the runner returns a
 * single result, and both the JSON block and the readable profile render from that result. A failed
 * run always ends in `error` with a message — the page never stays in `loading`.
 */
@Component({
  selector: 'app-root',
  imports: [EndpointBadge, OperationPanel, ResultPanel, ProfileView, ApiPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'app.html',
})
export class App {
  private readonly apollo = inject(Apollo);
  readonly tabActive = signal<UTabs>('result');
  readonly state = signal<IOperationState>(INITIAL_STATE);
  readonly busy = computed(() => this.state().status === 'loading');
  readonly profiles = computed(() => {
    const result = this.state().result;
    return result === null ? [] : extractProfiles(result.data);
  });

  run(request: IOperationRequest): void {
    this.state.set({ status: 'loading', result: null, failure: null });
    void runOperation(this.apollo, request.document, request.variables).then((result) => {
      this.state.set({ status: toStatus(result), result, failure: null });
    });
  }

  reject(message: string): void {
    this.state.set({ status: 'error', result: null, failure: message });
  }
}
