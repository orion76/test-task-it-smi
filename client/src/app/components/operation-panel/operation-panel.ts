import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
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
import { PRESETS } from '../constants';
import type { IOperationPanel } from '../types';

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
  readonly documentSource = signal(TZ_EXAMPLE_QUERY);
  readonly variablesSource = signal('{}');

  readonly hint = computed(() => {
    const preset = this.presets.find((entry) => entry.name === this.operation());
    return preset === undefined ? '' : preset.hint;
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
          document: PROFILES_QUERY,
          variables: { limit: page.limit, offset: page.offset },
        });
        return;
      }
      this.run.emit({
        document: this.operation() === 'profile' ? PROFILE_QUERY : HEALTH_QUERY,
        variables: {},
      });
    } catch (error) {
      this.reject.emit(toErrorMessage(error));
    }
  }
}
