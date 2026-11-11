import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { IOperationResult, IOperationState } from '../../types';
import { STATUS_LABELS } from '../constants';
import type { IResultPanel } from '../types';

/**
 * Status, duration and the raw answer. The JSON is shown as is: the panel is a checking tool, so a
 * nested collection, a `null` field and a missing field have to stay distinguishable. GraphQL errors
 * and a network error are separate blocks — they mean different things.
 */
@Component({
  selector: 'app-result-panel',
  imports: [JsonPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'result-panel.html',
})
export class ResultPanel implements IResultPanel {
  readonly state = input.required<IOperationState>();

  readonly statusLabel = computed(() => STATUS_LABELS[this.state().status]);
  readonly result = computed<IOperationResult | null>(() => this.state().result);
}
