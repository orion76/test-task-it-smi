import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { getIntrospectionQuery } from 'graphql';
import { NgxJsonViewerModule } from 'ngx-json-viewer';

import { runOperation } from '../../api/operation.runner';
import type { IOperationResult } from '../../types';

const API_REQUEST = getIntrospectionQuery();

/**
 * Runs the introspection query and shows the raw answer as a JSON tree. A failure reaches the panel
 * the same way as in the result panel: a GraphQL error and an unreachable backend are separate
 * blocks, so neither of them is lost behind an empty answer.
 */
@Component({
  selector: 'app-api-panel',
  imports: [NgxJsonViewerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'api-panel.html',
})
export class ApiPanel implements OnInit {
  private readonly apollo = inject(Apollo);

  readonly result = signal<IOperationResult | null>(null);

  ngOnInit(): void {
    void runOperation(this.apollo, gql`${API_REQUEST}`, {}).then((result) => {
      this.result.set(result);
    });
  }
}
