import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  HEALTH_QUERY,
  PROFILE_QUERY,
  PROFILES_QUERY,
  TZ_EXAMPLE_QUERY,
} from '../../api/documents';
import { toErrorMessage } from '../../api/error.message';
import { parseCustomRequest, parsePageParams } from '../../api/request.parser';
import type { IOperationRequest, UOperationName } from '../../types';
import type { IOperationPanel, IPreset } from '../types';
import { gql } from 'apollo-angular';

const PRESETS: IPreset[] = [
  {
    name: 'health',
    label: 'health',
    hint: 'health { status } — готовность бэкенда.',
    query: HEALTH_QUERY
  },
  {
    name: 'profile',
    label: 'profile',
    hint: 'Профиль со всеми вложенными коллекциями: links, skills, experience, projects.',
    query: PROFILE_QUERY
  },
  {
    name: 'profiles',
    label: 'profiles',
    hint: 'Страница профилей: limit в диапазоне 1..100 и offset.',
    query: PROFILES_QUERY
  },
  {
    name: 'custom',
    label: 'свой запрос',
    hint: 'Любой документ GraphQL и переменные JSON; документ из TZ уже подставлен.',
    query: TZ_EXAMPLE_QUERY
  },
];

/**
 * Builds the request of the selected preset or of the free-form editor. Input that cannot become a
 * request is rejected before the network is touched: the message goes to the result panel, so a
 * broken JSON does not break the page.
 */
@Component({
  selector: 'app-operation-panel',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'operation-panel.html',
})
export class OperationPanel implements IOperationPanel {
  readonly busy = input.required<boolean>();
  readonly run = output<IOperationRequest>();
  readonly reject = output<string>();

  readonly presets = PRESETS;
  readonly operation = signal<UOperationName>('health');
  readonly limit = signal('10');
  readonly offset = signal('0');
  // readonly documentSource = signal(TZ_EXAMPLE_QUERY);
  readonly variablesSource = signal('{}');

  readonly preset = computed(() => {
    return this.presets.find((entry) => entry.name === this.operation());
  })

  readonly hint = computed(() => {
    return this.preset()?.hint ?? '';
  });

  readonly documentSource = linkedSignal(() => {
    return this.preset()?.query ?? '';
  });


  submit(): void {
    try {
      if (this.operation() === 'custom') {
        this.run.emit(parseCustomRequest(this.documentSource(), this.variablesSource()));
        return;
      }
      if (this.operation() === 'profiles') {
        const page = parsePageParams(this.limit(), this.offset());
        this.run.emit({
          document: gql`${PROFILES_QUERY}`,
          variables: { limit: page.limit, offset: page.offset },
        });
        return;
      }
      this.run.emit({
        document: gql`${this.operation() === 'profile' ? PROFILE_QUERY : HEALTH_QUERY}`,
        variables: {},
      });
    } catch (error) {
      this.reject.emit(toErrorMessage(error));
    }
  }
}
